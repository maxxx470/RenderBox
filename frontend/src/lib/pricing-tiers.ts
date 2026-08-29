// Single source of truth for RenderBox's 3 pricing tiers — consumed by both
// the client-side /tarifs pricing cards and the server-side Maketou checkout
// route, so a future price/quota change is a 3-line edit here, not a page
// rewrite. Quota enforcement (actually capping a user's monthly generations
// per purchased tier) is NOT wired yet — these numbers are display-only
// pending real usage data post-launch (see the pricing spec's own note).
export type PricingTierId = 'decouverte' | 'standard' | 'pro';

export interface PricingTier {
  id: PricingTierId;
  generationsPerMonth: number;
  /** Smallest unit — XOF has no decimals. */
  priceXof: number;
  /** Approximate, display-only — no live FX conversion. */
  priceUsdDisplay: number;
  featured: boolean;
}

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    id: 'decouverte',
    generationsPerMonth: 30,
    priceXof: 6000,
    priceUsdDisplay: 10,
    featured: false,
  },
  {
    id: 'standard',
    generationsPerMonth: 100,
    priceXof: 15000,
    priceUsdDisplay: 24,
    featured: true,
  },
  { id: 'pro', generationsPerMonth: 300, priceXof: 36000, priceUsdDisplay: 58, featured: false },
];

export function getPricingTier(id: string): PricingTier | undefined {
  return PRICING_TIERS.find((tier) => tier.id === id);
}

export function isPricingTierId(value: string): value is PricingTierId {
  return PRICING_TIERS.some((tier) => tier.id === value);
}
