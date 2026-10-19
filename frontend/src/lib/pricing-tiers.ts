// Single source of truth for RenderPro's 3 plans and their credits — read by
// the shared plan card (PricingCard, on the landing AND on /app/tarifs), the
// server-side Maketou checkout route and the credit gate
// (lib/server/generation/tier-quota.ts). Prices, credits, the cost scale and
// the list of what a plan includes live HERE and nowhere else; the
// dictionaries only hold labels, never a figure (owner, 2026-10-13).
import type { TranslationKey } from './i18n/dictionaries';
import { DEFAULT_RESOLUTION, type ResolutionKey } from './server/generation/resolutions';

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
  { id: 'decouverte', creditsPerMonth: 1000, priceXof: 6000, priceUsdDisplay: 10, featured: false },
  { id: 'standard', creditsPerMonth: 3000, priceXof: 15000, priceUsdDisplay: 24, featured: true },
  { id: 'pro', creditsPerMonth: 8000, priceXof: 36000, priceUsdDisplay: 58, featured: false },
];

/** What every plan includes, under its credits, in this order — the landing
 *  and the in-app Abonnement page list exactly these. */
export const PLAN_FEATURES: readonly TranslationKey[] = [
  'landing.pricingFeatureEngines',
  'landing.pricingFeaturePresets',
  'landing.pricingFeatureEditing',
  'landing.pricingFeatureAssistant',
];

// ── The cost scale ──────────────────────────────────────────────────────────
// One image produced at 1K or 2K, whatever made it: a render, Commenter,
// Ajouter or Améliorer.
export const RENDER_COST = 50;
/** One image produced at 4K. */
export const RENDER_COST_4K = 70;
/** The analysis behind a materials sheet, asked when the sheet is copied
 *  (2026-10-19, owner: 7.5 credits, 5 being the plain cost; balances are whole
 *  numbers, so 8). Paid by the user, whatever their role. */
export const SHEET_COST = 8;
/** A message to the built-in assistant. */
export const ASSISTANT_COST: number = 0;

/** What N images at this size cost. The server computes it from the request
 *  it validated — never from a figure the client sends. */
export function renderCost(resolution: ResolutionKey | null | undefined, count = 1): number {
  const unit = (resolution ?? DEFAULT_RESOLUTION) === '4k' ? RENDER_COST_4K : RENDER_COST;
  return unit * Math.max(0, count);
}

// Before credits (until 2026-10-13) a plan gave renders: 30 / 100 / 300. The
// migration 9_phase8_credits converted what each account had left at 50
// credits a render; a renewal then grants the plan's credits above.

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
