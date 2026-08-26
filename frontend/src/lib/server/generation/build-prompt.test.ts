import { describe, it, expect } from 'vitest';
import { buildGenerationPrompt } from './build-prompt';
import { PRESETS, PRESET_KEYS } from './presets';

const materials = [
  { face: 'facade_principale', valeur: 'Enduit blanc taloché', source: 'auto', confidence: 90 },
  { face: 'toiture', valeur: 'Tuile terre cuite', source: 'manuel', confidence: null },
];

describe('buildGenerationPrompt', () => {
  it('includes the materials sheet for every preset, including esquisse', () => {
    for (const preset of PRESET_KEYS) {
      const prompt = buildGenerationPrompt({ materialsSnapshot: materials, preset });
      expect(prompt).toContain('Enduit blanc taloché');
      expect(prompt).toContain('Tuile terre cuite');
    }
  });

  it('orders materials before the preset modifier before the custom prompt', () => {
    const prompt = buildGenerationPrompt({
      materialsSnapshot: materials,
      preset: 'nuit_ext',
      customPrompt: 'vue depuis la rue',
    });
    const materialsIdx = prompt.indexOf('Enduit blanc taloché');
    const presetIdx = prompt.indexOf(PRESETS.nuit_ext.promptModifier);
    const customIdx = prompt.indexOf('vue depuis la rue');
    expect(materialsIdx).toBeGreaterThanOrEqual(0);
    expect(presetIdx).toBeGreaterThan(materialsIdx);
    expect(customIdx).toBeGreaterThan(presetIdx);
  });

  it('omits the materials section when the project has no materials yet', () => {
    const prompt = buildGenerationPrompt({ materialsSnapshot: [], preset: 'jour_ext' });
    expect(prompt).not.toContain('Keep these materials consistent');
    expect(prompt).toContain(PRESETS.jour_ext.promptModifier);
  });

  it('omits the custom prompt section when none is given', () => {
    const prompt = buildGenerationPrompt({ materialsSnapshot: [], preset: 'jour_ext' });
    expect(prompt.trim().endsWith(PRESETS.jour_ext.promptModifier)).toBe(true);
  });

  it('ignores a whitespace-only custom prompt', () => {
    const prompt = buildGenerationPrompt({
      materialsSnapshot: [],
      preset: 'jour_ext',
      customPrompt: '   ',
    });
    expect(prompt.trim().endsWith(PRESETS.jour_ext.promptModifier)).toBe(true);
  });
});
