// Améliorer (2026-10-19, the owner's prompt audit, D6, annex C): eight
// improvements, « pièce sombre » under Lumière, three intensities. The prompt
// itself is the specification's (spec-prompts.ts, tested in
// spec-prompts.test.ts).
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ENHANCE_STRENGTH,
  ENHANCE_AMBIANCE_KEYS,
  ENHANCE_OPTION_KEYS,
  ENHANCE_STRENGTHS,
  isEnhanceOptionKey,
} from './enhance';
import { ENHANCE_LINES, STRENGTH_LINES } from './enhance-prompt';

describe('What the page offers', () => {
  it('eight improvements, « pièce sombre » not being a ninth', () => {
    expect(ENHANCE_OPTION_KEYS).toEqual([
      'sharpness',
      'detail',
      'lighting',
      'materials',
      'sky',
      'vegetation',
      'life',
      'ambiance',
    ]);
  });

  it('three intensities, medium by default', () => {
    expect(ENHANCE_STRENGTHS).toEqual(['subtle', 'medium', 'strong']);
    expect(DEFAULT_ENHANCE_STRENGTH).toBe('medium');
  });

  it('isEnhanceOptionKey accepts known keys and rejects anything else', () => {
    expect(isEnhanceOptionKey('sky')).toBe(true);
    expect(isEnhanceOptionKey('ambiance')).toBe(true);
    expect(isEnhanceOptionKey('darkRoom')).toBe(false);
    expect(isEnhanceOptionKey('')).toBe(false);
  });
});

describe('The lines the prompt adds as the user request', () => {
  it('one line per improvement and per intensity, and four ambiance profiles', () => {
    for (const k of ENHANCE_OPTION_KEYS) expect(ENHANCE_LINES[k].length).toBeGreaterThan(20);
    for (const s of ENHANCE_STRENGTHS) expect(STRENGTH_LINES[s]).toMatch(/^Intensity: /);
    expect(ENHANCE_AMBIANCE_KEYS).toHaveLength(4);
  });
});
