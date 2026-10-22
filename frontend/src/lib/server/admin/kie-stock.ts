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
  const [balance, held, accounting, topUps] = await Promise.all([
    readBalance().catch(() => null),
    prisma.user.aggregate({
      where: { creditsBalance: { gt: 0 } },
      _sum: { creditsBalance: true },
      _count: { _all: true },
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
