import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { MONERIZ_FEE_RATE, XOF_PER_CREDIT, XOF_PER_USD } from '@/lib/provider-cost';

// The accounts of the back-office (2026-10-17, owner: « mon chiffre
// d'affaires, ce que je gagne, tous les détails sur ce que je dépense … si je
// suis en faillite ou si je gagne »): what came in (PAID orders, counted on
// the day they were paid, as in insights.ts) against what went out — the
// provider's commission on each payment, the Kie credits each image really cost
// (RenderNode.providerCredits, stored since 2026-10-17) and the fixed monthly
// costs listed below — month by month, in FCFA.
//
// Not counted, and said on the page: images made on the direct Google /
// OpenAI keys (their price is billed by those accounts, not recorded here).

// The dollar in FCFA (600, fixed by the owner on 2026-10-22), a credit in
// FCFA (3) and the provider's fee live in provider-cost.ts.
export { MONERIZ_FEE_RATE, XOF_PER_USD };

/**
 * Each payment provider's published commission. An order whose provider is
 * not listed books NOTHING rather than a guessed figure — booking an
 * invented fee against a real sale is worse than booking none, because it
 * silently understates the profit and nobody can tell it was invented.
 *
 * Orders settled since 2026-11-02 carry their real fee in
 * `Order.commissionAmount`, which wins over this table; the rates are what
 * price the history, where no fee was recorded.
 */
export const FEE_RATES: Readonly<Record<string, number>> = {
  moneriz: MONERIZ_FEE_RATE,
};

/** What the owner pays every month whatever the sales (hosting, domain,
 *  tools), in dollars, from the month it started (YYYY-MM). Empty until the
 *  owner lists them — the page says so. */
export const FIXED_COSTS: readonly { label: string; usdPerMonth: number; since: string }[] = [];

export interface Ledger {
  revenueXof: number;
  orders: number;
  providerFeeXof: number;
  kieXof: number;
  kieCredits: number;
  kieImages: number;
  /** Images made on the direct Google / OpenAI keys: cost not recorded. */
  directImages: number;
  fixedXof: number;
  expensesXof: number;
  resultXof: number;
}

export type AccountingPeriod = 'month' | 'lastMonth' | 'year' | 'all';

export interface Accounting {
  periods: Record<AccountingPeriod, Ledger>;
  /** The last 12 months, oldest first (YYYY-MM). */
  months: ({ key: string } & Ledger)[];
  xofPerUsd: number;
  feeRate: number;
  fixedCosts: { label: string; xofPerMonth: number }[];
}

const monthKey = (d: Date) => d.toISOString().slice(0, 7);

function emptyLedger(): Ledger {
  return {
    revenueXof: 0,
    orders: 0,
    providerFeeXof: 0,
    kieXof: 0,
    kieCredits: 0,
    kieImages: 0,
    directImages: 0,
    fixedXof: 0,
    expensesXof: 0,
    resultXof: 0,
  };
}

/** Adds b into a and returns a (the totals are rounded once, at the end). */
function add(a: Ledger, b: Ledger): Ledger {
  for (const k of Object.keys(a) as (keyof Ledger)[]) a[k] += b[k];
  return a;
}

function settle(l: Ledger): Ledger {
  const expenses = l.providerFeeXof + l.kieXof + l.fixedXof;
  return {
    ...l,
    providerFeeXof: Math.round(l.providerFeeXof),
    kieXof: Math.round(l.kieXof),
    kieCredits: Math.round(l.kieCredits * 100) / 100,
    fixedXof: Math.round(l.fixedXof),
    expensesXof: Math.round(expenses),
    resultXof: Math.round(l.revenueXof - expenses),
  };
}

export async function computeAccounting(
  prisma: PrismaClient,
  now: Date = new Date(),
  fixedCosts: readonly { label: string; usdPerMonth: number; since: string }[] = FIXED_COSTS,
): Promise<Accounting> {
  const [orders, nodes] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'PAID', currency: 'XOF' },
      select: {
        amount: true,
        provider: true,
        commissionAmount: true,
        paidAt: true,
        createdAt: true,
      },
    }),
    prisma.renderNode.findMany({
      where: {
        kind: 'GENERATED',
        OR: [{ providerCredits: { not: null } }, { engineVersion: null }],
      },
      select: { createdAt: true, engine: true, engineVersion: true, providerCredits: true },
    }),
  ]);

  const byMonth = new Map<string, Ledger>();
  const at = (key: string) => {
    let l = byMonth.get(key);
    if (!l) byMonth.set(key, (l = emptyLedger()));
    return l;
  };

  for (const o of orders) {
    const l = at(monthKey(o.paidAt ?? o.createdAt));
    l.revenueXof += o.amount;
    l.orders++;
    // The real commission when the order recorded one (Moneriz writes
    // `commissionAmount` at settlement, from the sum actually settled),
    // else the provider's published rate. Nothing is invented for a
    // provider whose cut we do not know: it books zero rather than a guess.
    if (o.commissionAmount !== null && o.commissionAmount > 0) {
      l.providerFeeXof += o.commissionAmount;
    } else {
      l.providerFeeXof += o.amount * (FEE_RATES[o.provider] ?? 0);
    }
  }
  for (const n of nodes) {
    const l = at(monthKey(n.createdAt));
    if (n.providerCredits !== null) {
      l.kieCredits += n.providerCredits;
      l.kieXof += n.providerCredits * XOF_PER_CREDIT;
      l.kieImages++;
    } else if (!n.engineVersion && n.engine) {
      l.directImages++;
    }
  }

  // The last 12 months always exist, even empty, for the chart.
  const thisMonth = monthKey(now);
  const chartKeys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    chartKeys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  for (const k of chartKeys) at(k);

  // Fixed costs: every month from their start up to this one.
  for (const c of fixedCosts) {
    const [y, m] = c.since.split('-').map(Number);
    for (let d = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, 1)); monthKey(d) <= thisMonth; ) {
      at(monthKey(d)).fixedXof += c.usdPerMonth * XOF_PER_USD;
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    }
  }

  const lastMonth = chartKeys[10] ?? thisMonth;
  const year = thisMonth.slice(0, 4);
  const sum = (keep: (k: string) => boolean) => {
    const total = emptyLedger();
    for (const [k, l] of byMonth) if (k <= thisMonth && keep(k)) add(total, l);
    return settle(total);
  };

  return {
    periods: {
      month: sum((k) => k === thisMonth),
      lastMonth: sum((k) => k === lastMonth),
      year: sum((k) => k.startsWith(year)),
      all: sum(() => true),
    },
    months: chartKeys.map((key) => ({ key, ...settle({ ...at(key) }) })),
    xofPerUsd: Math.round(XOF_PER_USD * 100) / 100,
    // The rate of the provider now in use, for the page's own caption.
    feeRate: MONERIZ_FEE_RATE,
    fixedCosts: fixedCosts.map((c) => ({
      label: c.label,
      xofPerMonth: Math.round(c.usdPerMonth * XOF_PER_USD),
    })),
  };
}
