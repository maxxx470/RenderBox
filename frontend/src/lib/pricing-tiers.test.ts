import { describe, expect, it } from 'vitest';
import { PRICING_TIERS, billedXof, getPricingTier } from './pricing-tiers';
import { XOF_PER_USD } from './provider-cost';

describe('pricing-tiers — the plans (credits are Kie credits since 2026-10-22)', () => {
  // 2026-10-29 (owner): the dollar is the reference, the FCFA is billed.
  // **Each FCFA figure here is also the price of a Maketou product, set by
  // hand on its dashboard**: Maketou charges what its product says, so a
  // change here without the matching change in Maketou makes a customer read
  // one price and pay another. That is why the sums are pinned below rather
  // than merely computed — `billedXof` derives them from XOF_PER_USD, and a
  // change to that rate must fail here instead of quietly repricing the site.
  it('three plans: 9.99 / 24.99 / 59.99 $, billed 6 000 / 15 000 / 36 000 FCFA, credits 500 / 1 500 / 4 000', () => {
    expect(PRICING_TIERS.map((t) => [t.id, t.priceUsd, t.priceXof, t.creditsPerMonth])).toEqual([
      ['decouverte', 9.99, 6000, 500],
      ['standard', 24.99, 15000, 1500],
      ['pro', 59.99, 36000, 4000],
    ]);
    expect(PRICING_TIERS.filter((t) => t.featured).map((t) => t.id)).toEqual(['standard']);
  });

  it('bills the dollar price at the configured rate, rounded to the hundred franc', () => {
    expect(XOF_PER_USD).toBe(600);
    expect(billedXof(9.99)).toBe(6000); // 5 994 → 6 000
    expect(billedXof(24.99)).toBe(15000); // 14 994 → 15 000
    expect(billedXof(59.99)).toBe(36000); // 35 994 → 36 000
  });

  it('getPricingTier finds a plan by id and nothing else', () => {
    expect(getPricingTier('pro')?.creditsPerMonth).toBe(4000);
    expect(getPricingTier('gold')).toBeUndefined();
  });
});
