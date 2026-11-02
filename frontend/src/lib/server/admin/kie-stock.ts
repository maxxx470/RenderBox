import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { PRICING_TIERS, type PricingTierId } from '@/lib/pricing-tiers';
import {
  KIE_USD_PER_CREDIT,
  MAKETOU_FEE_RATE,
  XOF_PER_CREDIT,
  XOF_PER_USD,
  creditsValue,
  offeredPrices,
  planMargin,
  type OfferedPrice,
} from '@/lib/provider-cost';
import { AUTH_DISABLED_USER_ID } from '@/lib/server/auth-disabled';
import { computeAccounting } from './accounting';

// « Stock Kie » in /admin (2026-10-22, owner — Phase 2): since a site credit IS
// a Kie credit, the Kie balance and the credits the accounts hold are in the
// same unit and can be compared directly. Everything here is read: the Kie
// balance comes live from Kie and is never written anywhere; the top-ups are
// what the admins recorded by hand (KieTopUp), for the history only.

export type CoverageLevel = 'red' | 'orange' | 'green';

/** Under 100 % the accounts hold more credits than Kie has left: red; under
 *  120 %, orange; above, green. No credits held: nothing is owed, green. */
export function coverageLevel(coverage: number | null): CoverageLevel {
  if (coverage === null) return 'green';
  if (coverage < 1) return 'red';
  if (coverage < 1.2) return 'orange';
  return 'green';
}

// The room left in the stock, used when an admin gives or takes credits back
// by hand (2026-10-26, owner: « si on lui ajoute un nombre de crédits que le
// stock n'atteint pas, ça devrait refuser »). Taking credits back from an
// account lowers the circulation, so they come back into the room on their
// own — nothing is lost.

export type StockBalance =
  /** No Kie account at all: the renders run on the direct keys and a site
   *  credit answers to no stock, so a gift is not held back. */
  | { kind: 'open' }
  /** Kie refused to say (bad key, no answer): the room cannot be guessed, so
   *  a gift waits rather than promising credits that may not exist. */
  | { kind: 'unknown' }
  | { kind: 'known'; balance: number };

/** Reads Kie's balance for that decision — read only, as everywhere else. */
export async function readStockBalance(
  configured: boolean,
  readBalance: () => Promise<number | null>,
): Promise<StockBalance> {
  if (!configured) return { kind: 'open' };
  const balance = await readBalance().catch(() => null);
  return balance === null ? { kind: 'unknown' } : { kind: 'known', balance };
}

/** The room a gift has to fit in: the balance minus what every account
 *  already holds. Null when there is no stock to respect, or when the balance
 *  could not be read. */
export function stockRoom(stock: StockBalance, circulation: number): number | null {
  return stock.kind === 'known' ? stock.balance - circulation : null;
}

export type StockRefusal =
  | { error: 'STOCK_UNKNOWN' }
  | {
      error: 'STOCK_TOO_LOW';
      requested: number;
      room: number;
      balance: number;
      circulation: number;
    };

/** Why this hand adjustment cannot go through, or null when it can. Taking
 *  credits back (a negative delta) is always allowed: it gives room back. */
export function stockRefusal(
  stock: StockBalance,
  delta: number,
  circulation: number,
): StockRefusal | null {
  if (delta <= 0 || stock.kind === 'open') return null;
  if (stock.kind === 'unknown') return { error: 'STOCK_UNKNOWN' };
  const room = stock.balance - circulation;
  if (delta <= room) return null;
  return {
    error: 'STOCK_TOO_LOW',
    requested: delta,
    room,
    balance: stock.balance,
    circulation,
  };
}

export interface KieTopUpRow {
  id: string;
  createdAt: string;
  amountUsd: number;
  credits: number;
  note: string | null;
  adminEmail: string | null;
}

export interface KieStock {
  configured: boolean;
  /** Kie's live balance, in credits; null when it could not be read. */
  balance: number | null;
  balanceUsd: number | null;
  balanceXof: number | null;
  /** Credits every account holds — what Kie may still be asked for. */
  circulation: number;
  /** Of which the free-access demo account (demo@localhost) holds — counted
   *  in the circulation all the same: every visitor spends it while
   *  AUTH_DISABLED is on (owner, 2026-10-22). */
  demoCredits: number;
  accountsWithCredits: number;
  /** balance / circulation; null when nothing is held or the balance is unknown. */
  coverage: number | null;
  level: CoverageLevel;
  /** How many images the stock still makes, per offered engine × size. */
  imagesLeft: (OfferedPrice & { images: number | null })[];
  finances: {
    revenueXof: number;
    kieCreditsConsumed: number;
    kieCostXof: number;
    maketouFeeXof: number;
    profitXof: number;
    /** profit / revenue; null without revenue. */
    margin: number | null;
  };
  plans: {
    id: PricingTierId;
    priceXof: number;
    credits: number;
    kieCostXof: number;
    gross: number;
    net: number;
  }[];
  topUps: KieTopUpRow[];
  constants: {
    usdPerCredit: number;
    xofPerUsd: number;
    xofPerCredit: number;
    maketouFeeRate: number;
  };
}

export async function computeKieStock(
  prisma: PrismaClient,
  readBalance: () => Promise<number | null>,
  configured: boolean,
): Promise<KieStock> {
  const [balance, held, demo, accounting, topUps] = await Promise.all([
    readBalance().catch(() => null),
    prisma.user.aggregate({
      where: { creditsBalance: { gt: 0 } },
      _sum: { creditsBalance: true },
      _count: { _all: true },
    }),
    prisma.user.findUnique({
      where: { id: AUTH_DISABLED_USER_ID },
      select: { creditsBalance: true },
    }),
    computeAccounting(prisma),
    prisma.kieTopUp.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        amountUsd: true,
        credits: true,
        note: true,
        admin: { select: { email: true } },
      },
    }),
  ]);

  const circulation = held._sum.creditsBalance ?? 0;
  const coverage = balance === null || circulation <= 0 ? null : balance / circulation;
  const all = accounting.periods.all;
  const profitXof = all.revenueXof - all.kieXof - all.maketouFeeXof;
  const value = balance === null ? null : creditsValue(balance);

  return {
    configured,
    balance,
    balanceUsd: value?.usd ?? null,
    balanceXof: value?.xof ?? null,
    circulation,
    demoCredits: Math.max(0, demo?.creditsBalance ?? 0),
    accountsWithCredits: held._count._all,
    coverage,
    level: balance === null ? (circulation > 0 ? 'red' : 'green') : coverageLevel(coverage),
    imagesLeft: offeredPrices().map((p) => ({
      ...p,
      images: balance === null ? null : Math.floor(balance / p.credits),
    })),
    finances: {
      revenueXof: all.revenueXof,
      kieCreditsConsumed: all.kieCredits,
      kieCostXof: all.kieXof,
      maketouFeeXof: all.maketouFeeXof,
      profitXof,
      margin: all.revenueXof > 0 ? profitXof / all.revenueXof : null,
    },
    plans: PRICING_TIERS.map((tier) => ({
      id: tier.id,
      priceXof: tier.priceXof,
      credits: tier.creditsPerMonth,
      ...planMargin(tier),
    })),
    topUps: topUps.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      amountUsd: r.amountUsd,
      credits: r.credits,
      note: r.note,
      adminEmail: r.admin?.email ?? null,
    })),
    constants: {
      usdPerCredit: KIE_USD_PER_CREDIT,
      xofPerUsd: XOF_PER_USD,
      xofPerCredit: XOF_PER_CREDIT,
      maketouFeeRate: MAKETOU_FEE_RATE,
    },
  };
}
