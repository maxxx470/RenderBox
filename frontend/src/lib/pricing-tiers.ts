// Single source of truth for RenderBox's 3 pricing tiers — consumed by the
// client-side /tarifs pricing cards, the server-side Maketou checkout route,
// and the tier-quota gate (lib/server/generation/tier-quota.ts), so a future
// price/quota change is a 3-line edit here, not a page rewrite.
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
