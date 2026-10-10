import { describe, it, expect } from 'vitest';
import { buildGenerationPrompt } from './build-prompt';
import { PHOTO_RENDER_MODIFIER, PRESETS, PRESET_KEYS } from './presets';
import { TEMPLATES } from './templates';

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

  it("sends a template's prompt without any ambiance modifier", () => {
    const prompt = buildGenerationPrompt({
      materialsSnapshot: materials,
      preset: null,
      customPrompt: TEMPLATES.nuit_ext.prompt.en,
    });
    for (const key of PRESET_KEYS) expect(prompt).not.toContain(PRESETS[key].promptModifier);
    expect(prompt).not.toContain(PHOTO_RENDER_MODIFIER);
    expect(prompt).toContain('Enduit blanc taloché');
    expect(prompt.trim().endsWith(TEMPLATES.nuit_ext.prompt.en)).toBe(true);
  });

  it('asks for a faithful photo render when there is no ambiance and no template', () => {
    const prompt = buildGenerationPrompt({
      materialsSnapshot: [],
      preset: null,
      customPrompt: 'façade en bois',
      photoRender: true,
    });
    expect(prompt).toContain(PHOTO_RENDER_MODIFIER);
    expect(prompt.indexOf(PHOTO_RENDER_MODIFIER)).toBeLessThan(prompt.indexOf('façade en bois'));
  });

  it('never adds the photo render on top of an ambiance', () => {
    const prompt = buildGenerationPrompt({
      materialsSnapshot: [],
      preset: 'eclate',
      photoRender: true,
    });
    expect(prompt).toContain(PRESETS.eclate.promptModifier);
    expect(prompt).not.toContain(PHOTO_RENDER_MODIFIER);
  });
});
