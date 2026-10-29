// Single source of truth for RenderPro's 3 plans and their credits — read by
// the shared plan card (PricingCard, on the landing AND on /app/tarifs), the
// server-side Maketou checkout route and the credit gate
// (lib/server/generation/tier-quota.ts). Prices, credits and the list of what
// a plan includes live HERE; what each action costs lives in
// lib/provider-cost.ts (the Kie grid, 2026-10-22); the dictionaries only hold
// labels, never a figure (owner, 2026-10-13).
import type { TranslationKey } from './i18n/dictionaries';
import { XOF_PER_USD } from './provider-cost';

export type PricingTierId = 'decouverte' | 'standard' | 'pro';

export interface PricingTier {
  id: PricingTierId;
  /** Credits granted at each activation or renewal, for 30 days. */
  creditsPerMonth: number;
  /**
   * The REFERENCE price, in US dollars (2026-10-29, owner). It is what the
   * plan card shows as its headline figure — exactly, to a visitor already on
   * the dollar, converted at the day's rate to anyone else. The « 99 » that
   * used to sit on the FCFA figure lives here now: a price is read in the
   * currency the reader thinks in.
   */
  priceUsd: number;
  /**
   * What is actually CHARGED, in FCFA (the smallest unit — XOF has no
   * decimals). `billedXof` derives it from the dollar price, so the two can
   * never drift apart silently.
   */
  priceXof: number;
  featured: boolean;
}

/**
 * The dollar reference turned into the sum Maketou charges: times
 * `XOF_PER_USD`, rounded to the nearest hundred francs, because a price tag
 * of 5 994 FCFA reads as a mistake rather than as a price.
 *
 * Changing `XOF_PER_USD` therefore changes what every customer pays. A test
 * pins the three results (6 000 / 15 000 / 36 000) so that such a change
 * fails loudly instead of quietly charging a new amount — and it has to,
 * because **the price of each Maketou product is set by hand in Maketou's own
 * dashboard**: Maketou charges what its product says, not what the site
 * shows, and a gap between the two is a customer paying one price while
 * reading another.
 */
export function billedXof(priceUsd: number): number {
  return Math.round((priceUsd * XOF_PER_USD) / 100) * 100;
}

export const PRICING_TIERS: readonly PricingTier[] = [
  // Credits are Kie credits since 2026-10-22 (owner): one credit = 0.005 $.
  //
  // 2026-10-29 (owner): the dollar is the reference price and the FCFA is
  // what is billed. 9.99 / 24.99 / 59.99 $ → 6 000 / 15 000 / 36 000 FCFA.
  // These three sums restore the exact margins the plans were designed for:
  // 75 / 70 / 66.7 % gross, 67 / 62 / 58.7 % net of Maketou's 8 % (checked by
  // planMargin's test). The 5 900 / 14 900 / 35 900 of 2026-10-28, which cost
  // four tenths of a point, are gone.
  {
    id: 'decouverte',
    creditsPerMonth: 500,
    priceUsd: 9.99,
    priceXof: billedXof(9.99),
    featured: false,
  },
  {
    id: 'standard',
    creditsPerMonth: 1500,
    priceUsd: 24.99,
    priceXof: billedXof(24.99),
    featured: true,
  },
  {
    id: 'pro',
    creditsPerMonth: 4000,
    priceUsd: 59.99,
    priceXof: billedXof(59.99),
    featured: false,
  },
];

/** What every plan includes, under its credits, in this order — the landing
 *  and the in-app Abonnement page list exactly these. */
export const PLAN_FEATURES: readonly TranslationKey[] = [
  'landing.pricingFeatureEngines',
  'landing.pricingFeaturePresets',
  'landing.pricingFeatureEditing',
  'landing.pricingFeatureAssistant',
];

export function getPricingTier(id: string): PricingTier | undefined {
  return PRICING_TIERS.find((tier) => tier.id === id);
}

export function isPricingTierId(value: string): value is PricingTierId {
  return PRICING_TIERS.some((tier) => tier.id === value);
}

/**
 * Reads the tier out of an `Order.metadata` JSON blob (set at checkout —
 * see api/payments/checkout/route.ts). Shared by /app's "current tier"
 * lookup and the checkout-confirmation tier activation so the same
 * defensive parsing lives in one place.
 */
export function getOrderMetadataTier(metadata: unknown): PricingTierId | null {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const tier = (metadata as Record<string, unknown>).tier;
    if (typeof tier === 'string' && isPricingTierId(tier)) return tier;
  }
  return null;
}
