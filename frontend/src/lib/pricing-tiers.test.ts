import { describe, expect, it } from 'vitest';
import { PRICING_TIERS, getPricingTier } from './pricing-tiers';

describe('pricing-tiers — the plans (credits are Kie credits since 2026-10-22)', () => {
  // Prices end in 900 since 2026-10-28 (owner). **Each figure here is also
  // the price of a Maketou product, set by hand on its dashboard**: Maketou
  // charges what its product says, so changing one of these without changing
  // Maketou makes a customer read one price and pay another.
  it('three plans, 5 900 / 14 900 / 35 900 FCFA, credits 500 / 1 500 / 4 000', () => {
    expect(PRICING_TIERS.map((t) => [t.id, t.priceXof, t.creditsPerMonth])).toEqual([
      ['decouverte', 5900, 500],
      ['standard', 14900, 1500],
      ['pro', 35900, 4000],
    ]);
    expect(PRICING_TIERS.filter((t) => t.featured).map((t) => t.id)).toEqual(['standard']);
  });

  it('getPricingTier finds a plan by id and nothing else', () => {
    expect(getPricingTier('pro')?.creditsPerMonth).toBe(4000);
    expect(getPricingTier('gold')).toBeUndefined();
  });
});
