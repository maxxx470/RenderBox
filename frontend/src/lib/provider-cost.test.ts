import { describe, it, expect } from 'vitest';
import { KIE_CREDITS_PER_IMAGE, realImageCost, renderPrice, XOF_PER_USD } from './provider-cost';
import { ENGINE_NAMES } from '@/lib/server/generation/engines/types';
import { RESOLUTION_KEYS } from '@/lib/server/generation/resolutions';

describe('realImageCost', () => {
  it('prices every engine at every size', () => {
    for (const engine of ENGINE_NAMES) {
      for (const resolution of RESOLUTION_KEYS) {
        expect(KIE_CREDITS_PER_IMAGE[engine][resolution]).toBeGreaterThan(0);
      }
    }
  });

  it('turns Kie credits into dollars (200 = 1 $) and FCFA', () => {
    // Visio (Seedream 5.0 Pro) at 1K and 2K, kie.ai's price on 2026-10-19.
    const visio = realImageCost('nanobanana', '1k');
    expect(visio.kieCredits).toBe(7);
    expect(visio.usd).toBeCloseTo(0.035, 10);
    expect(visio.xof).toBe(Math.round(0.035 * XOF_PER_USD));
    expect(realImageCost('nanobanana', '2k').kieCredits).toBe(14);
    expect(realImageCost('nanobanana', '4k').kieCredits).toBe(14);
    // Pixel IA at 4K, three variants.
    expect(realImageCost('gpt_image', '4k', 3).kieCredits).toBe(48);
  });
});

describe('renderPrice', () => {
  it("charges an administrator Kie's price, everyone else the RenderPro price", () => {
    expect(renderPrice('SUPERADMIN', 'nanobanana', '1k')).toBe(7);
    expect(renderPrice('ADMIN', 'gpt_image', '2k')).toBe(10);
    expect(renderPrice('SUPERADMIN', 'gpt_image', '4k', 2)).toBe(32);
    expect(renderPrice('USER', 'nanobanana', '1k')).toBe(50);
    expect(renderPrice('USER', 'gpt_image', '4k', 2)).toBe(140);
    expect(renderPrice(undefined, 'gpt_image', '1k')).toBe(50);
  });
});
