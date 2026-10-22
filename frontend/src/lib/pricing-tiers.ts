// Single source of truth for RenderPro's 3 plans and their credits — read by
// the shared plan card (PricingCard, on the landing AND on /app/tarifs), the
// server-side Maketou checkout route and the credit gate
// (lib/server/generation/tier-quota.ts). Prices, credits and the list of what
// a plan includes live HERE; what each action costs lives in
// lib/provider-cost.ts (the Kie grid, 2026-10-22); the dictionaries only hold
// labels, never a figure (owner, 2026-10-13).
import type { TranslationKey } from './i18n/dictionaries';

export type PricingTierId = 'decouverte' | 'standard' | 'pro';

export interface PricingTier {
  id: PricingTierId;
  /** Credits granted at each activation or renewal, for 30 days. */
  creditsPerMonth: number;
  /** Smallest unit — XOF has no decimals. */
  priceXof: number;
  /** Approximate, display-only — no live FX conversion. */
  priceUsdDisplay: number;
  featured: boolean;
}

export const PRICING_TIERS: readonly PricingTier[] = [
  // Credits are Kie credits since 2026-10-22 (owner): one credit = 0.005 $.
  { id: 'decouverte', creditsPerMonth: 500, priceXof: 6000, priceUsdDisplay: 10, featured: false },
  { id: 'standard', creditsPerMonth: 1500, priceXof: 15000, priceUsdDisplay: 24, featured: true },
  { id: 'pro', creditsPerMonth: 4000, priceXof: 36000, priceUsdDisplay: 58, featured: false },
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
