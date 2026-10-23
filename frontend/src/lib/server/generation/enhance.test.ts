// Améliorer (2026-10-19, the owner's prompt audit, D6, annex C): eight
// improvements, « pièce sombre » under Lumière, three intensities, the
// geometry lock and the materials block on whatever is ticked.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ENHANCE_STRENGTH,
  ENHANCE_AMBIANCE_KEYS,
  ENHANCE_OPTION_KEYS,
  ENHANCE_STRENGTHS,
  isEnhanceOptionKey,
} from './enhance';
import {
  buildEnhancePrompt,
  DARK_ROOM_LINE,
  ENHANCE_LINES,
  STRENGTH_LINES,
} from './enhance-prompt';
import { GEOMETRY_LOCK, MATERIALS_BLOCK, profileLight } from './render-profiles';
import { ENGINE_NAMES } from './engines/types';

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

describe('buildEnhancePrompt', () => {
  const all = (engine: (typeof ENGINE_NAMES)[number]) =>
    buildEnhancePrompt({
      engine,
      options: [...ENHANCE_OPTION_KEYS],
      strength: 'strong',
      darkRoom: true,
      ambiance: 'nuit_int',
    });

  it.each(ENGINE_NAMES)(
    'every category at once keeps the lock first and the materials block (%s)',
    (e) => {
      const p = all(e);
      expect(p.split('\n').slice(0, 3)).toContain(GEOMETRY_LOCK);
      expect(p).toContain(MATERIALS_BLOCK);
      for (const k of ENHANCE_OPTION_KEYS) expect(p).toContain(ENHANCE_LINES[k]);
      expect(p).toContain(DARK_ROOM_LINE);
      expect(p).toContain(profileLight('nuit_int').visio);
      expect(p).toContain('HDR look, oversaturation, oversharpening, new objects');
    },
  );

  it('includes exactly the ticked options, once, in a fixed order', () => {
    const a = buildEnhancePrompt({
      engine: 'gpt_image',
      options: ['sky', 'detail'],
      strength: 'medium',
    });
    const b = buildEnhancePrompt({
      engine: 'gpt_image',
      options: ['detail', 'sky', 'detail'],
      strength: 'medium',
    });
    expect(a).toBe(b);
    expect(a.indexOf(ENHANCE_LINES.detail)).toBeLessThan(a.indexOf(ENHANCE_LINES.sky));
    expect(a).not.toContain(ENHANCE_LINES.life);
    expect(a.split(ENHANCE_LINES.detail)).toHaveLength(2);
  });

  it('« pièce sombre » only with Lumière; the profile only with Ambiance', () => {
    const p = buildEnhancePrompt({
      engine: 'nanobanana',
      options: ['sharpness'],
      strength: 'subtle',
      darkRoom: true,
      ambiance: 'jour_ext',
    });
    expect(p).not.toContain(DARK_ROOM_LINE);
    expect(p).not.toContain('Lighting guidance');
  });

  it.each(ENHANCE_STRENGTHS)('intensity %s', (s) => {
    const p = buildEnhancePrompt({ engine: 'nanobanana', options: ['sharpness'], strength: s });
    expect(p).toContain(STRENGTH_LINES[s]);
    for (const other of ENHANCE_STRENGTHS)
      if (other !== s) expect(p).not.toContain(STRENGTH_LINES[other]);
  });

  it('life never adds anything; the sky is lightly hazy by default', () => {
    expect(ENHANCE_LINES.life).toContain('Do not add anything if nothing was there.');
    expect(ENHANCE_LINES.sky).toContain('lightly hazy by default');
  });

  it('the instruction alone is a request, limited to what it names', () => {
    const p = buildEnhancePrompt({
      engine: 'gpt_image',
      options: [],
      strength: 'medium',
      instruction: '  vitrages plus clairs ',
    });
    expect(p).toContain('Only modify what this request explicitly names: "vitrages plus clairs".');
    expect(p).not.toContain('IMPROVEMENTS');
    expect(p).not.toContain(MATERIALS_BLOCK);
    expect(p).toContain('Apart from what the request above explicitly names');
  });

  it('never speaks of a reference image: only the source is sent (D8)', () => {
    for (const e of ENGINE_NAMES) expect(all(e).toLowerCase()).not.toContain('reference');
  });

  it('Pixel IA: sections, then the final check', () => {
    const titles = all('gpt_image')
      .split('\n')
      .filter((l) => /^\d\. [A-Z]/.test(l));
    expect(titles).toEqual([
      '1. LOCK',
      '2. IMPROVEMENTS',
      '3. INTENSITY',
      '4. MATERIALS',
      '5. AVOID',
      '6. FINAL CHECK',
    ]);
  });

  it.each(ENGINE_NAMES)('frozen (%s)', async (engine) => {
    await expect(
      buildEnhancePrompt({
        engine,
        options: ['sharpness', 'lighting', 'materials', 'sky', 'ambiance'],
        strength: 'medium',
        darkRoom: true,
        ambiance: ENHANCE_AMBIANCE_KEYS[1],
      }),
    ).toMatchFileSnapshot(
      `./__prompts__/ameliorer-${engine === 'nanobanana' ? 'visio' : 'pixel'}.txt`,
    );
  });
});
