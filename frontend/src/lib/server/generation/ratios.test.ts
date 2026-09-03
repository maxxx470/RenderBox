import { describe, it, expect } from 'vitest';
import { RATIOS, RATIO_KEYS, isRatioSupported, supportedRatios } from './ratios';
import { ENGINE_NAMES } from './engines/types';

describe('ratios', () => {
  it('gives auto no engine translation at all', () => {
    // 'auto' means "ask for nothing" — a value here would silently start
    // forcing a ratio on every generation that never requested one.
    expect(RATIOS.auto.gemini).toBeNull();
    expect(RATIOS.auto.openai).toBeNull();
  });

  it('treats auto as supported by every engine', () => {
    for (const engine of ENGINE_NAMES) {
      expect(isRatioSupported('auto', engine)).toBe(true);
    }
  });

  it('maps each OpenAI size to the ratio it actually is', () => {
    // The whole point of the table: a size that does not match its label
    // would return a differently-framed image than the user asked for.
    const dims: Record<string, [number, number]> = {
      '1024x1024': [1024, 1024],
      '1536x1024': [1536, 1024],
      '1024x1536': [1024, 1536],
    };
    for (const key of RATIO_KEYS) {
      const size = RATIOS[key].openai;
      if (!size) continue;
      const parts = key.split(':');
      const [w, h] = dims[size]!;
      expect(w / h).toBeCloseTo(Number(parts[0]) / Number(parts[1]), 5);
    }
  });

  it('labels each Gemini ratio with the ratio itself', () => {
    for (const key of RATIO_KEYS) {
      const gemini = RATIOS[key].gemini;
      if (!gemini) continue;
      expect(gemini).toBe(key);
    }
  });

  it('reports 16:9 and 9:16 as unavailable on gpt_image', () => {
    // gpt-image-1 has no such size; approximating to 3:2 would ignore the
    // user's choice without telling them.
    expect(isRatioSupported('16:9', 'gpt_image')).toBe(false);
    expect(isRatioSupported('9:16', 'gpt_image')).toBe(false);
    expect(isRatioSupported('16:9', 'nanobanana')).toBe(true);
  });

  it('lists only supported ratios per engine, auto first', () => {
    for (const engine of ENGINE_NAMES) {
      const list = supportedRatios(engine);
      expect(list[0]).toBe('auto');
      for (const r of list) expect(isRatioSupported(r, engine)).toBe(true);
    }
    expect(supportedRatios('gpt_image')).not.toContain('16:9');
  });
});
