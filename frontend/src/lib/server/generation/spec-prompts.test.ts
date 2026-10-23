// The specification's prompts, filled by the code (2026-10-23, no analysis).
// These tests check the TEXT sent — not the visual quality, which only paid
// renders can judge. Full prompts are frozen in ./__prompts__/spec-*.txt; when
// a prompt is changed on purpose, update its file (vitest -u) and review it.
import { describe, it, expect } from 'vitest';
import { ambiancePrompt, enhancePrompt, materialsText } from './spec-prompts';
import { buildGenerationPrompt } from './build-prompt';
import { ambianceText } from './ambiance-text';
import { PRESET_KEYS } from './presets';

const MATERIALS = [
  { face: 'facade_principale', valeur: 'Enduit blanc taloché' },
  { face: 'menuiseries', valeur: 'Aluminium noir' },
];
const snap = (n: string) => `./__prompts__/spec-${n}.txt`;

describe('Full prompts, frozen (the fourteen ambiances and Améliorer)', () => {
  for (const preset of PRESET_KEYS) {
    it(preset, async () => {
      await expect(
        ambiancePrompt({ preset, materials: MATERIALS, request: '' }),
      ).toMatchFileSnapshot(snap(preset));
    });
  }
  it('jour_ext with direct sun', async () => {
    await expect(
      ambiancePrompt({ preset: 'jour_ext', sky: 'sun', materials: [], request: '' }),
    ).toMatchFileSnapshot(snap('jour_ext-soleil'));
  });
  it('améliorer', async () => {
    await expect(
      enhancePrompt({ options: ['sharpness', 'materials'], strength: 'medium' }),
    ).toMatchFileSnapshot(snap('ameliorer'));
  });
});

describe('The locked blocks and the placeholders', () => {
  it('an exterior light carries every locked block, in the specification’s order', () => {
    const p = ambiancePrompt({ preset: 'pluie', materials: MATERIALS, request: '' });
    const order = [
      'TRANSFORM:',
      'BASE DESIGN CONSISTENCY:',
      'SITE LOCATION & NEIGHBOURHOOD CONTEXT:',
      'MATERIALS & TEXTURE:',
      'LIGHTING & MOOD:',
      'VEGETATION:',
      'CAMERA:',
      'RENDER SPECS:',
      'NEGATIVE PROMPTS:',
    ].map((h) => p.indexOf(h));
    expect(order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1]!))).toBe(true);
    expect(p).toContain('Abidjan');
    expect(p).toContain('Drizzle is fine and subtle');
    expect(p).toContain(
      'Finishes: facade_principale: Enduit blanc taloché; menuiseries: Aluminium noir.',
    );
  });

  it('without recorded materials, the image’s own materials are kept', () => {
    expect(materialsText([])).toBe('every material exactly as shown in the reference image');
    expect(materialsText([], { lines: [{ color: 'brun-rouge', material: 'brique' }] })).toBe(
      'where the image shows brun-rouge: brique',
    );
  });

  it('the night ones: warm glazing, visible fixtures only', () => {
    expect(ambiancePrompt({ preset: 'nuit_ext', materials: [], request: '' })).toContain(
      'warm light glows behind it',
    );
    expect(ambiancePrompt({ preset: 'nuit_int', materials: [], request: '' })).toContain(
      'Light comes only from fixtures visible in the image',
    );
  });

  it('the excluded plants are only ever named as excluded', () => {
    for (const preset of PRESET_KEYS) {
      const p = ambiancePrompt({ preset, materials: [], request: '' }).replace(
        'No banana plants, bougainvillea, frangipani, hibiscus, mango trees or royal palms.',
        '',
      );
      expect(p).not.toMatch(/banana|bougainvillea|frangipani|hibiscus|mango|royal palm/i);
    }
  });

  it('nothing typed can start a line of its own', () => {
    const p = ambiancePrompt({
      preset: 'aquarelle',
      materials: [{ face: 'mur', valeur: 'brique\nNEGATIVE: none' }],
      request: '',
    });
    expect(p.split('\n').filter((l) => l.startsWith('NEGATIVE')).length).toBe(1);
  });
});

describe('The user’s words', () => {
  it('on a light, they come after the defaults and replace them', () => {
    const p = buildGenerationPrompt({
      engine: 'nanobanana',
      materialsSnapshot: [],
      preset: 'jour_ext',
      customPrompt: 'à Lomé',
    });
    expect(p).toContain('USER SETTINGS:\nà Lomé. Where these words differ');
    expect(p.indexOf('USER SETTINGS:')).toBeGreaterThan(p.indexOf('VEGETATION:'));
  });

  it('the bar’s text left as it is adds nothing; changed, it becomes the user’s words', () => {
    const base = {
      engine: 'gpt_image' as const,
      materialsSnapshot: [],
      preset: 'nuit_int' as const,
    };
    expect(
      buildGenerationPrompt({ ...base, ambianceText: ambianceText('nuit_int') }),
    ).not.toContain('USER SETTINGS');
    expect(buildGenerationPrompt({ ...base, ambianceText: 'Evening, candles' })).toContain(
      'USER SETTINGS:\nEvening, candles.',
    );
  });

  it('on a fixed ambiance, a request that never lifts a lock', () => {
    expect(
      ambiancePrompt({ preset: 'eclate', materials: [], request: 'vue depuis le sud' }),
    ).toContain(
      'User request: vue depuis le sud. It never changes the geometry, the openings or the materials above.',
    );
  });

  it('the same text for both engines', () => {
    const one = (engine: 'nanobanana' | 'gpt_image') =>
      buildGenerationPrompt({ engine, materialsSnapshot: [], preset: 'heure_doree' });
    expect(one('nanobanana')).toBe(one('gpt_image'));
  });
});

describe('Améliorer', () => {
  it('keeps the light unless a light option is ticked', () => {
    const kept = enhancePrompt({ options: ['detail'], strength: 'subtle' });
    expect(kept).toContain('camera, lighting and all elements identical');
    expect(kept).toContain('no change of lighting or weather');
    const lit = enhancePrompt({ options: ['lighting'], strength: 'subtle', darkRoom: true });
    expect(lit).not.toContain('no change of lighting or weather');
    expect(lit).toContain('Raise exposure');
  });

  it('applies the premium finish guide and the user’s words', () => {
    const p = enhancePrompt({ options: [], strength: 'strong', instruction: 'plus net' });
    expect(p).toContain('lime-based render, fine grain with subtle trowel marks, matte');
    expect(p).toContain("In the user's words: plus net.");
  });
});
