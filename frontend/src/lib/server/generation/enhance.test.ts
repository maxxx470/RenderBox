import { describe, it, expect } from 'vitest';
import {
  buildEnhancePrompt,
  ENHANCE_OPTIONS,
  ENHANCE_OPTION_KEYS,
  isEnhanceOptionKey,
} from './enhance';
import { PRESETS, PRESET_KEYS } from './presets';

describe('buildEnhancePrompt', () => {
  it('always leads with the preservation clause', () => {
    const prompt = buildEnhancePrompt({ options: [], strength: 'subtle' });
    expect(prompt.split('\n')[0]).toContain('Keep the exact same composition');
  });

  it('includes exactly the ticked options, in a fixed order', () => {
    const a = buildEnhancePrompt({ options: ['sky', 'detail'], strength: 'strong' });
    const b = buildEnhancePrompt({ options: ['detail', 'sky', 'detail'], strength: 'strong' });
    expect(a).toBe(b);
    expect(a.indexOf(ENHANCE_OPTIONS.detail.prompt)).toBeLessThan(
      a.indexOf(ENHANCE_OPTIONS.sky.prompt),
    );
    expect(a).not.toContain(ENHANCE_OPTIONS.life.prompt);
    expect(a.split(ENHANCE_OPTIONS.detail.prompt)).toHaveLength(2);
  });

  it('never carries an ambiance preset modifier', () => {
    const prompt = buildEnhancePrompt({ options: [...ENHANCE_OPTION_KEYS], strength: 'strong' });
    for (const key of PRESET_KEYS) expect(prompt).not.toContain(PRESETS[key].promptModifier);
  });

  it('appends the free-text instruction last, trimmed', () => {
    const prompt = buildEnhancePrompt({
      options: ['lighting'],
      strength: 'subtle',
      instruction: '  warmer glass  ',
    });
    expect(prompt.endsWith('\nwarmer glass')).toBe(true);
  });

  it('ignores a blank instruction', () => {
    const prompt = buildEnhancePrompt({
      options: ['lighting'],
      strength: 'subtle',
      instruction: '   ',
    });
    expect(prompt.endsWith('cleaner.')).toBe(true);
  });
});

describe('buildEnhancePrompt references', () => {
  it('names each reference image after the source, by its option', () => {
    const prompt = buildEnhancePrompt({
      options: ['materials', 'sky'],
      strength: 'subtle',
      references: ['materials', 'sky'],
    });
    expect(prompt).toContain('The first image is the render to enhance.');
    expect(prompt).toContain(`Image 2 is a reference for ${ENHANCE_OPTIONS.materials.reference}.`);
    expect(prompt).toContain(`Image 3 is a reference for ${ENHANCE_OPTIONS.sky.reference}.`);
  });

  it('says nothing about references when there are none', () => {
    const prompt = buildEnhancePrompt({ options: ['lighting'], strength: 'subtle' });
    expect(prompt).not.toContain('reference');
  });

  it('runs on the instruction alone when nothing is ticked', () => {
    const prompt = buildEnhancePrompt({
      options: [],
      strength: 'subtle',
      instruction: 'brighter interior',
    });
    expect(prompt.split('\n')[0]).toContain('Keep the exact same composition');
    expect(prompt.endsWith('\nbrighter interior')).toBe(true);
  });
});

describe('isEnhanceOptionKey', () => {
  it('accepts known keys and rejects anything else', () => {
    expect(isEnhanceOptionKey('detail')).toBe(true);
    expect(isEnhanceOptionKey('jour_ext')).toBe(false);
  });
});
