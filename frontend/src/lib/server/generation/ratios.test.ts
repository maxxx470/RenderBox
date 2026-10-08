import { describe, it, expect } from 'vitest';
import { RATIOS, RATIO_KEYS, isRatioKey } from './ratios';

describe('ratios', () => {
  it('gives auto no engine translation at all', () => {
    // 'auto' means "ask for nothing" — a value here would silently start
    // forcing a ratio on every generation that never requested one.
    expect(RATIOS.auto.value).toBeNull();
    expect(RATIOS.auto.gemini).toBeNull();
    expect(RATIOS.auto.openai).toBeNull();
  });

  it('labels each Gemini ratio with the ratio itself and its true value', () => {
    for (const key of RATIO_KEYS) {
      if (key === 'auto') continue;
      const [w, h] = key.split(':').map(Number) as [number, number];
      expect(RATIOS[key].gemini).toBe(key);
      expect(RATIOS[key].value).toBeCloseTo(w / h, 5);
    }
  });

  it('asks gpt-image-1 for the size of the same orientation', () => {
    // The image is cropped to the exact ratio afterwards: asking for the
    // nearest shape keeps that crop as small as possible.
    for (const key of RATIO_KEYS) {
      const spec = RATIOS[key];
      if (spec.value === null) continue;
      if (spec.value > 1.2) expect(spec.openai).toBe('1536x1024');
      else if (spec.value < 1 / 1.2) expect(spec.openai).toBe('1024x1536');
      else expect(spec.openai).toBe('1024x1024');
    }
  });

  it('offers the wide and tall formats on every engine', () => {
    for (const key of ['16:9', '9:16', '21:9', '4:5'] as const) {
      expect(RATIOS[key].gemini).toBe(key);
      expect(RATIOS[key].openai).not.toBeNull();
    }
  });

  it('recognises its own keys only', () => {
    expect(isRatioKey('16:9')).toBe(true);
    expect(isRatioKey('auto')).toBe(true);
    expect(isRatioKey('7:3')).toBe(false);
  });
});
