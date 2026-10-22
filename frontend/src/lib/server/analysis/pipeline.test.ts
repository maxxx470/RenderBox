// The whole pipeline before a render (specification, steps 2 to 6) and the
// project's memory (phase 2): Claude is answered by a mocked fetch, the
// sheets by the Prisma mock.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import sharp from 'sharp';
import { prismaMock } from '@/test-utils/prisma-mock';
import { prepareAmbiancePrompt, prepareEnhancePrompt } from './pipeline';
import { matchedSheet, sheetsForPrompt } from './sheets';
import { PLAN, VILLA, VILLA_ENHANCE, VILLA_LABELS, VILLA_SECTIONS } from './fixtures';

const claude = (json: object) => ({
  ok: true,
  json: async () => ({
    content: [{ type: 'text', text: JSON.stringify(json) }],
    usage: { input_tokens: 1, output_tokens: 2 },
  }),
});
const sentText = (fetchMock: ReturnType<typeof vi.fn>, call: number) =>
  JSON.parse((fetchMock.mock.calls[call] as [string, RequestInit])[1].body as string).messages[0]
    .content as { type: string; text?: string }[];

let IMAGE: Buffer;

beforeEach(async () => {
  vi.stubEnv('KIE_API_KEY', 'kie-test');
  IMAGE = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#888' } })
    .png()
    .toBuffer();
  prismaMock.buildingSheet.findMany.mockResolvedValue([]);
  prismaMock.buildingSheet.create.mockResolvedValue({ id: 'sheet-new' } as never);
  prismaMock.buildingSheet.update.mockResolvedValue({ id: 'sheet-old' } as never);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('sheets', () => {
  const rows = [{ id: 's1', analysis: { ...VILLA }, sections: null, premium: null }];
  it('the analysis recognises a sheet of this project only with « yes »', () => {
    expect(matchedSheet(rows, { same_building: 'yes', matched_sheet: 's1' })?.id).toBe('s1');
    expect(matchedSheet(rows, { same_building: 'unsure', matched_sheet: 's1' })).toBeNull();
    expect(matchedSheet(rows, { same_building: 'yes', matched_sheet: 'other-project' })).toBeNull();
  });
  it('Claude sees each sheet’s id and analysis, without the look and the bookkeeping', () => {
    const [s] = sheetsForPrompt([
      { ...rows[0]!, analysis: { ...VILLA, look: { recipe: 'x' } } },
    ]) as Record<string, unknown>[];
    expect(s).toMatchObject({ id: 's1', lock_summary: VILLA.lock_summary });
    expect(s).not.toHaveProperty('look');
    expect(s).not.toHaveProperty('same_building');
  });
});

describe('prepareAmbiancePrompt', () => {
  it('Exterior day: analysis, then the sections, then the prompt; a new sheet keeps site and vegetation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(claude(VILLA))
      .mockResolvedValueOnce(claude(VILLA_SECTIONS));
    vi.stubGlobal('fetch', fetchMock);
    const res = await prepareAmbiancePrompt(prismaMock, {
      projectId: 'p1',
      preset: 'jour_ext',
      image: IMAGE,
      overrides: '',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentText(fetchMock, 0)[0]?.type).toBe('image');
    expect(sentText(fetchMock, 0)[1]?.text).toContain('Project reference sheets: none');
    expect(sentText(fetchMock, 1)).toHaveLength(1);
    expect(res.prompt).toContain(VILLA_SECTIONS.vegetation);
    expect(res.prompt).toContain(`Geometry to preserve: ${VILLA.lock_summary}.`);
    expect(prismaMock.buildingSheet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'p1',
        kind: 'building',
        sections: { site: VILLA_SECTIONS.site, vegetation: VILLA_SECTIONS.vegetation },
      }),
      select: { id: true },
    });
    expect(res.trace).toMatchObject({ sheetId: 'sheet-new', matched: false });
    expect(res.trace.usage).toHaveLength(2);
  });

  it('the same building in another ambiance: its sheet is passed, recognised, updated; its sections reused', async () => {
    prismaMock.buildingSheet.findMany.mockResolvedValue([
      {
        id: 'sheet-old',
        analysis: VILLA,
        sections: { site: VILLA_SECTIONS.site, vegetation: VILLA_SECTIONS.vegetation },
        premium: null,
      },
    ] as never);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(claude({ ...VILLA, same_building: 'yes', matched_sheet: 'sheet-old' }))
      .mockResolvedValueOnce(
        claude({ ...VILLA_SECTIONS, site: 'Somewhere else', lighting: 'Rain light.' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const res = await prepareAmbiancePrompt(prismaMock, {
      projectId: 'p1',
      preset: 'pluie',
      image: IMAGE,
      overrides: '',
    });
    expect(sentText(fetchMock, 0)[1]?.text).toContain('"id":"sheet-old"');
    expect(res.ok && res.prompt).toContain(VILLA_SECTIONS.site);
    expect(res.ok && res.prompt).toContain('Rain light.');
    expect(prismaMock.buildingSheet.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sheet-old' } }),
    );
    expect(prismaMock.buildingSheet.create).not.toHaveBeenCalled();
  });

  it('a fixed ambiance has no second call; its extra field is asked for', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(claude(VILLA_LABELS));
    vi.stubGlobal('fetch', fetchMock);
    const res = await prepareAmbiancePrompt(prismaMock, {
      projectId: 'p1',
      preset: 'eclate',
      image: IMAGE,
      overrides: '',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentText(fetchMock, 0)[1]?.text).toContain('labels_fr [string]');
    expect(res.ok && res.prompt).toContain('Toiture, Étage');
  });

  it('the furnished 3D plan reads a floor plan, with the plan sheets', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(claude(PLAN));
    vi.stubGlobal('fetch', fetchMock);
    const res = await prepareAmbiancePrompt(prismaMock, {
      projectId: 'p1',
      preset: 'plan_3d',
      image: IMAGE,
      overrides: '',
    });
    expect(prismaMock.buildingSheet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'p1', kind: 'plan' } }),
    );
    expect(sentText(fetchMock, 0)[1]?.text).toContain('Analyze this floor plan.');
    expect(res.ok && res.prompt).toContain('"name":"Séjour"');
  });

  it('an unreadable image stops before anything is written', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(claude({ status: 'unreadable' })));
    const res = await prepareAmbiancePrompt(prismaMock, {
      projectId: 'p1',
      preset: 'jour_ext',
      image: IMAGE,
      overrides: '',
    });
    expect(res).toEqual({ ok: false, step: 'analysis', reason: 'unreadable' });
    expect(prismaMock.buildingSheet.create).not.toHaveBeenCalled();
  });

  it('a writing that fails stops the render, but the analysis is kept as the building’s memory', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(claude(VILLA))
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const res = await prepareAmbiancePrompt(prismaMock, {
      projectId: 'p1',
      preset: 'jour_int',
      image: IMAGE,
      overrides: '',
    });
    expect(res).toEqual({ ok: false, step: 'writing', reason: 'failed' });
    expect(prismaMock.buildingSheet.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ sections: expect.anything() }),
      select: { id: true },
    });
  });
});

describe('prepareEnhancePrompt', () => {
  it('chooses a finish per element, stores them on the building’s sheet, in its own shape', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(claude(VILLA_ENHANCE));
    vi.stubGlobal('fetch', fetchMock);
    const res = await prepareEnhancePrompt(prismaMock, {
      projectId: 'p1',
      image: IMAGE,
      options: ['detail'],
      strength: 'medium',
    });
    expect(sentText(fetchMock, 0)[1]?.text).toContain('in order to improve its material quality');
    expect(res.ok && res.prompt).toContain('ground floor walls: lime-based render');
    expect(prismaMock.buildingSheet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'building',
        analysis: expect.objectContaining({
          lock_summary: VILLA.lock_summary,
          materials: expect.arrayContaining([
            { element: 'ground floor walls', material: 'render', color: 'white' },
          ]),
        }),
        premium: {
          'ground floor walls': 'lime-based render, fine grain with subtle trowel marks, matte',
          'upper floor cladding':
            'clear-oiled iroko slats with visible grain and tight even joints, in the original wood tone',
        },
      }),
      select: { id: true },
    });
  });
});
