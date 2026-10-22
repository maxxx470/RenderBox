// Call 2: the sections of ambiances 1 to 6 and the code's checks on them
// (specification, phase 3 « Contrôles du code après l'appel »).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkSections, excludedPlantsIn, writeSections, writerDefaults } from './writer';
import { BEDROOM_SECTIONS, VILLA, VILLA_SECTIONS } from './fixtures';

const answer = (sections: object) => ({
  ok: true,
  json: async () => ({ content: [{ type: 'text', text: JSON.stringify(sections) }], usage: {} }),
});

beforeEach(() => vi.stubEnv('KIE_API_KEY', 'kie-test'));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('checkSections', () => {
  it('the three keys of the family, each one line under 60 words', () => {
    expect(checkSections('exterior', VILLA_SECTIONS, '')).toEqual(VILLA_SECTIONS);
    expect(checkSections('interior', BEDROOM_SECTIONS, '')).toEqual(BEDROOM_SECTIONS);
    expect(checkSections('exterior', { ...VILLA_SECTIONS, vegetation: undefined }, '')).toBeNull();
    expect(checkSections('interior', VILLA_SECTIONS, '')).toBeNull();
    expect(
      checkSections('exterior', { ...VILLA_SECTIONS, site: 'word '.repeat(60) }, ''),
    ).toBeNull();
  });

  it('no excluded plant unless the user asked for it', () => {
    const banana = { ...VILLA_SECTIONS, vegetation: 'Banana plants and ferns beside the plot.' };
    expect(checkSections('exterior', banana, '')).toBeNull();
    expect(
      checkSections('exterior', banana, 'avec des bananiers et des banana plants'),
    ).not.toBeNull();
    expect(excludedPlantsIn('a royal palm, hibiscus hedge', '')).toEqual([
      'hibiscus',
      'royal palms',
    ]);
    expect(excludedPlantsIn('mango tree', 'un manguier')).toEqual([]);
  });
});

describe('writerDefaults', () => {
  it('Africa by default, the ambiance’s settings, Exterior day’s sky chip', () => {
    expect(writerDefaults('jour_ext', 'sun')).toMatchObject({
      default_region: expect.stringContaining('Abidjan'),
      time: 'late morning, around 10-11 am',
      weather: 'blue sky with a few clouds, dry season',
    });
    expect(writerDefaults('jour_ext', undefined).weather).toContain('light haze');
    expect(writerDefaults('nuit_int', undefined)).toMatchObject({
      interior_greenery: 'potted ferns and a leafy plant with palm-like fronds',
      mood: 'intimate',
    });
  });
});

describe('writeSections', () => {
  it('writes the three sections from the analysis, the defaults and the user’s words', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(VILLA_SECTIONS));
    vi.stubGlobal('fetch', fetchMock);
    const res = await writeSections({
      preset: 'nuit_ext',
      analysis: VILLA,
      overrides: 'à Lomé',
      stored: null,
    });
    expect(res).toMatchObject({ ok: true, sections: VILLA_SECTIONS });
    const text = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
      .messages[0].content[0].text as string;
    expect(text).toContain('user overrides "à Lomé"');
    expect(text).toContain('stored sections none');
    expect(text).toContain('- Night: the neighbours show only a few distant warm lights.');
    expect(text).toContain('If "look" in the analysis is not null');
  });

  it('a building that has its sections keeps them: only the light is new', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        answer({ ...VILLA_SECTIONS, site: 'Another street', lighting: 'Golden light.' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const res = await writeSections({
      preset: 'heure_doree',
      analysis: VILLA,
      overrides: '',
      stored: { site: VILLA_SECTIONS.site, vegetation: VILLA_SECTIONS.vegetation },
    });
    expect(res).toMatchObject({
      ok: true,
      sections: {
        site: VILLA_SECTIONS.site,
        vegetation: VILLA_SECTIONS.vegetation,
        lighting: 'Golden light.',
      },
    });
    const text = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
      .messages[0].content[0].text as string;
    expect(text).toContain(
      `stored sections ${JSON.stringify({ site: VILLA_SECTIONS.site, vegetation: VILLA_SECTIONS.vegetation })}`,
    );
  });

  it('a check that fails: one more try, then the render stops', async () => {
    const bad = answer({ ...VILLA_SECTIONS, vegetation: 'Bougainvillea everywhere.' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(bad)
      .mockResolvedValueOnce(answer(VILLA_SECTIONS));
    vi.stubGlobal('fetch', fetchMock);
    expect(
      (await writeSections({ preset: 'jour_ext', analysis: VILLA, overrides: '', stored: null }))
        .ok,
    ).toBe(true);
    fetchMock.mockReset().mockResolvedValue(bad);
    expect(
      await writeSections({ preset: 'jour_ext', analysis: VILLA, overrides: '', stored: null }),
    ).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
