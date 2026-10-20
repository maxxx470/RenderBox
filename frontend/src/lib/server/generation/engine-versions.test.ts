import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ENGINE_VERSION,
  ENGINE_VERSION_KEYS,
  ENGINE_VERSIONS,
  engineDisplayName,
  kieRatioFor,
  parseEngineVersions,
  versionsOf,
} from './engine-versions';
import { RATIO_KEYS } from './ratios';

describe('engine versions', () => {
  it('names each version after our engines, never the vendor', () => {
    for (const key of ENGINE_VERSION_KEYS) {
      const { name, engine } = ENGINE_VERSIONS[key];
      const prefix = engine === 'nanobanana' ? 'Visio' : /^Pixel (IA|AI)/;
      expect(name.fr).toMatch(prefix);
      expect(name.en).toMatch(prefix);
      expect(`${name.fr} ${name.en}`).not.toMatch(/banana|gpt|gemini|openai|chatgpt/i);
    }
  });

  it('lists the owner-approved versions per engine, and defaults to one of them', () => {
    expect(versionsOf('nanobanana')).toEqual([
      'visio-1',
      'visio-pro',
      'visio-2',
      'visio-2-1',
      'visio-2-lite',
      'visio-3',
    ]);
    expect(versionsOf('gpt_image')).toEqual(['pixel-1-5', 'pixel-2', 'pixel-2-5']);
    expect(versionsOf('nanobanana')).toContain(DEFAULT_ENGINE_VERSION.nanobanana);
    expect(versionsOf('gpt_image')).toContain(DEFAULT_ENGINE_VERSION.gpt_image);
  });

  it('engineDisplayName: the engine alone, never a version (2026-10-17)', () => {
    expect(engineDisplayName('nanobanana', 'visio-2-1', 'fr')).toBe('Visio');
    expect(engineDisplayName('gpt_image', 'pixel-2-5', 'en')).toBe('Pixel AI');
    expect(engineDisplayName('gpt_image', null, 'fr')).toBe('Pixel IA');
    expect(engineDisplayName(null, 'not-a-version', 'fr')).toBe('Visio');
  });
});

describe('kieRatioFor', () => {
  const pro = ENGINE_VERSIONS['visio-pro'];
  const p15 = ENGINE_VERSIONS['pixel-1-5'];
  const p2 = ENGINE_VERSIONS['pixel-2'];
  const p25 = ENGINE_VERSIONS['pixel-2-5'];

  it('passes every ratio of the bar through when the model takes it', () => {
    for (const r of RATIO_KEYS.filter((k) => k !== 'auto')) {
      expect(kieRatioFor(pro, r, null, '2K')).toBe(r);
    }
  });

  it("sends 'auto' for auto when the model has it", () => {
    expect(kieRatioFor(pro, undefined, null, '1K')).toBe('auto');
    expect(kieRatioFor(p2, 'auto', null, '1K')).toBe('auto');
  });

  it("pins auto to the source's nearest ratio once its shape is given", () => {
    expect(kieRatioFor(pro, 'auto', 1.6, '2K')).toBe('3:2');
    expect(kieRatioFor(p25, undefined, 0.56, '2K')).toBe('9:16');
  });

  it("picks the source image's nearest ratio when the model needs one and has no auto", () => {
    expect(kieRatioFor(p15, undefined, 1.6, undefined)).toBe('3:2');
    expect(kieRatioFor(p15, 'auto', 0.7, undefined)).toBe('2:3');
    expect(kieRatioFor(p15, undefined, null, undefined)).toBe('1:1');
  });

  it('sends the nearest ratio the model takes; the crop makes it exact afterwards', () => {
    expect(kieRatioFor(p15, '16:9', null, undefined)).toBe('3:2');
    expect(kieRatioFor(p25, '5:4', null, '2K')).toBe('4:3');
    expect(kieRatioFor(p25, '4:5', null, '2K')).toBe('3:4');
  });

  it('respects a ratio the model refuses at one size only', () => {
    expect(kieRatioFor(p2, '5:4', null, '2K')).toBe('4:3');
    expect(kieRatioFor(p2, '5:4', null, '4K')).toBe('5:4');
    expect(kieRatioFor(p2, '5:4', null, '1K')).toBe('5:4');
  });
});

describe('parseEngineVersions', () => {
  it('the defaults when the account has chosen nothing', () => {
    expect(parseEngineVersions(null)).toEqual(DEFAULT_ENGINE_VERSION);
    expect(parseEngineVersions([])).toEqual(DEFAULT_ENGINE_VERSION);
  });

  it("keeps a chosen version, ignores an unknown one or another engine's", () => {
    expect(
      parseEngineVersions({ nanobanana: 'visio-2-1', gpt_image: 'visio-1', other: 'pixel-2' }),
    ).toEqual({ nanobanana: 'visio-2-1', gpt_image: 'pixel-2-5' });
    expect(parseEngineVersions({ nanobanana: 'visio-9' }).nanobanana).toBe('visio-2-1');
  });
});
