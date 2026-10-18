import { describe, it, expect } from 'vitest';
import { KIE_CREDITS_PER_IMAGE, realImageCost, XOF_PER_USD } from './provider-cost';
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
    // Visio at 1K, as Kie billed it on 2026-10-17.
    expect(realImageCost('nanobanana', '1k')).toEqual({
      kieCredits: 18,
      usd: 0.09,
      xof: Math.round(0.09 * XOF_PER_USD),
    });
    expect(realImageCost('nanobanana', '1k').xof).toBe(53);
    // Pixel IA at 4K, three variants.
    expect(realImageCost('gpt_image', '4k', 3).kieCredits).toBe(48);
  });
});
