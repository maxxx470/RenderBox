import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_COST,
  PRICING_TIERS,
  RENDER_COST,
  RENDER_COST_4K,
  getPricingTier,
  renderCost,
} from './pricing-tiers';

describe('pricing-tiers — the plans and the cost scale (owner, 2026-10-13)', () => {
  it('three plans, prices unchanged, credits 1 000 / 3 000 / 8 000', () => {
    expect(PRICING_TIERS.map((t) => [t.id, t.priceXof, t.creditsPerMonth])).toEqual([
      ['decouverte', 6000, 1000],
      ['standard', 15000, 3000],
      ['pro', 36000, 8000],
    ]);
    expect(PRICING_TIERS.filter((t) => t.featured).map((t) => t.id)).toEqual(['standard']);
  });

  it('a 1K or 2K image costs 50, a 4K image 70, the assistant 0', () => {
    expect(RENDER_COST).toBe(50);
    expect(RENDER_COST_4K).toBe(70);
    expect(ASSISTANT_COST).toBe(0);
    expect(renderCost('1k')).toBe(50);
    expect(renderCost('2k')).toBe(50);
    expect(renderCost('4k')).toBe(70);
  });

  it('no size given is the default size (1K): 50', () => {
    expect(renderCost(undefined)).toBe(50);
    expect(renderCost(null)).toBe(50);
  });

  it('N variants cost N times the unit', () => {
    expect(renderCost('2k', 3)).toBe(150);
    expect(renderCost('4k', 4)).toBe(280);
    expect(renderCost('1k', 0)).toBe(0);
  });

  it('getPricingTier finds a plan by id and nothing else', () => {
    expect(getPricingTier('pro')?.creditsPerMonth).toBe(8000);
    expect(getPricingTier('gold')).toBeUndefined();
  });
});
