import { describe, expect, it } from 'vitest';
import { PRICING_TIERS, getPricingTier } from './pricing-tiers';

describe('pricing-tiers — the plans (credits are Kie credits since 2026-10-22)', () => {
  it('three plans, prices unchanged, credits 500 / 1 500 / 4 000', () => {
    expect(PRICING_TIERS.map((t) => [t.id, t.priceXof, t.creditsPerMonth])).toEqual([
      ['decouverte', 6000, 500],
      ['standard', 15000, 1500],
      ['pro', 36000, 4000],
    ]);
    expect(PRICING_TIERS.filter((t) => t.featured).map((t) => t.id)).toEqual(['standard']);
  });

  it('getPricingTier finds a plan by id and nothing else', () => {
    expect(getPricingTier('pro')?.creditsPerMonth).toBe(4000);
    expect(getPricingTier('gold')).toBeUndefined();
  });
});
