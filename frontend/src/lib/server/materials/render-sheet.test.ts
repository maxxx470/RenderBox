// The image's code and its materials sheet — the database and the vision
// model are replaced.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock } from '@/test-utils/prisma-mock';

const { mockAnalyze, mockConfigured, mockDebit, mockRefund } = vi.hoisted(() => ({
  mockAnalyze: vi.fn(),
  mockConfigured: vi.fn(),
  mockDebit: vi.fn(),
  mockRefund: vi.fn(),
}));
vi.mock('@/lib/server/ai/vision-sheet', () => ({
  analyzeRenderSheet: mockAnalyze,
  sheetAnalysisConfigured: mockConfigured,
}));
vi.mock('@/lib/server/generation/tier-quota', () => ({
  debitCredits: mockDebit,
  refundCredits: mockRefund,
}));
// `after` only exists inside a request: the tasks run at once here.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => Promise<void>) => void task(),
}));
vi.mock('@/lib/i18n/request-locale', () => ({
  requestLocale: vi.fn().mockResolvedValue({ locale: 'fr', country: null }),
}));

import {
  completeSheet,
  ensureNodeCode,
  generateImageCode,
  readSheet,
  requestSheetAnalysis,
  resolvePastedSheet,
  scheduleSheet,
  startSheet,
} from './render-sheet';
import { IMAGE_CODE_RE } from '@/lib/render-sheet';

const LINES = [{ color: 'brun-rouge des murs', material: 'brique rouge' }];
const READY = {
  v: 1,
  status: 'ready',
  lines: LINES,
  ambiance: { key: 'nuit_ext', sky: null },
  sourceCode: 'RP-3D9F1A',
};

beforeEach(() => {
  mockAnalyze.mockReset();
  mockConfigured.mockReset().mockReturnValue(true);
  mockDebit.mockReset().mockResolvedValue({ ok: true, balance: 92 });
  mockRefund.mockReset();
});

describe('generateImageCode', () => {
  it('always has the shape of a code', () => {
    for (let i = 0; i < 200; i++) expect(generateImageCode()).toMatch(IMAGE_CODE_RE);
  });
});

describe('ensureNodeCode', () => {
  it('returns the code an image already has, without writing', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({ code: 'RP-AAAAAA' } as never);
    expect(await ensureNodeCode('n1')).toBe('RP-AAAAAA');
    expect(prismaMock.renderNode.updateMany).not.toHaveBeenCalled();
  });

  it('gives a code to an image that has none — and only fills a NULL', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({ code: null } as never);
    prismaMock.renderNode.updateMany.mockResolvedValue({ count: 1 } as never);
    const code = await ensureNodeCode('n1');
    expect(code).toMatch(IMAGE_CODE_RE);
    expect(prismaMock.renderNode.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', code: null },
      data: { code },
    });
  });

  it('keeps the code another request gave at the same moment', async () => {
    prismaMock.renderNode.findUnique
      .mockResolvedValueOnce({ code: null } as never)
      .mockResolvedValueOnce({ code: 'RP-BBBBBB' } as never);
    prismaMock.renderNode.updateMany.mockResolvedValue({ count: 0 } as never);
    expect(await ensureNodeCode('n1')).toBe('RP-BBBBBB');
  });

  it('draws again when the code is already taken by another image (unique index)', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({ code: null } as never);
    prismaMock.renderNode.updateMany
      .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
      .mockResolvedValueOnce({ count: 1 } as never);
    expect(await ensureNodeCode('n1')).toMatch(IMAGE_CODE_RE);
    expect(prismaMock.renderNode.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe('readSheet', () => {
  it('reads what was stored and refuses what is not a sheet', () => {
    expect(readSheet(READY)).toEqual(READY);
    expect(readSheet(null)).toBeNull();
    expect(readSheet({ v: 2, status: 'ready' })).toBeNull();
    expect(readSheet({ v: 1, status: 'ready', lines: [{ color: 1 }, ...LINES] })?.lines).toEqual(
      LINES,
    );
  });
});

describe('startSheet and completeSheet', () => {
  it('starts "idle" (no analysis, no charge), with the ambiance and the source image’s code', async () => {
    prismaMock.renderNode.findUnique
      .mockResolvedValueOnce({ code: 'RP-NNNNNN' } as never)
      .mockResolvedValueOnce({ code: 'RP-3D9F1A' } as never);
    await startSheet({
      nodeId: 'n2',
      sourceNodeId: 'n1',
      ambiance: { key: 'nuit_ext', sky: null },
    });
    expect(prismaMock.renderNode.update).toHaveBeenCalledWith({
      where: { id: 'n2' },
      data: {
        sheet: {
          v: 1,
          status: 'idle',
          lines: [],
          ambiance: { key: 'nuit_ext', sky: null },
          sourceCode: 'RP-3D9F1A',
        },
      },
    });
  });

  it('writes the lines once the analysis answers', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({
      sheet: { ...READY, status: 'pending', lines: [] },
    } as never);
    mockAnalyze.mockResolvedValue({ kind: 'lines', lines: LINES });
    await completeSheet({
      nodeId: 'n2',
      source: Buffer.from('a'),
      render: Buffer.from('b'),
      locale: 'fr',
    });
    expect(prismaMock.renderNode.update).toHaveBeenCalledWith({
      where: { id: 'n2' },
      data: { sheet: { ...READY, status: 'ready', lines: LINES } },
    });
  });

  it('says so when there is no analysis key, or when the analysis fails', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({
      sheet: { ...READY, status: 'pending', lines: [] },
    } as never);
    mockAnalyze.mockResolvedValue({ kind: 'not_configured' });
    await completeSheet({
      nodeId: 'n2',
      source: Buffer.from('a'),
      render: Buffer.from('b'),
      locale: 'en',
    });
    expect(prismaMock.renderNode.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { sheet: expect.objectContaining({ status: 'unavailable' }) },
      }),
    );
    mockAnalyze.mockResolvedValue({ kind: 'error', code: 'timeout' });
    await completeSheet({
      nodeId: 'n2',
      source: Buffer.from('a'),
      render: Buffer.from('b'),
      locale: 'en',
    });
    expect(prismaMock.renderNode.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { sheet: expect.objectContaining({ status: 'failed' }) } }),
    );
  });

  it('does nothing for an image that has no sheet to complete', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({ sheet: null } as never);
    await completeSheet({
      nodeId: 'n2',
      source: Buffer.from('a'),
      render: Buffer.from('b'),
      locale: 'fr',
    });
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it('scheduleSheet only starts the sheet — no analysis, no charge — and never throws', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({ code: 'RP-AAAAAA' } as never);
    await scheduleSheet({ nodeId: 'n2', sourceNodeId: 'n1', ambiance: null });
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(mockDebit).not.toHaveBeenCalled();

    prismaMock.renderNode.findUnique.mockRejectedValue(new Error('db down'));
    await expect(
      scheduleSheet({ nodeId: 'n2', sourceNodeId: 'n1', ambiance: null }),
    ).resolves.toBeUndefined();
  });
});

describe('requestSheetAnalysis — asked when the sheet is copied, paid by the user', () => {
  const IDLE = { ...READY, status: 'idle', lines: [] };
  const node = (sheet: unknown, over: Record<string, unknown> = {}) =>
    ({
      kind: 'GENERATED',
      blobUrl: 'https://blob/render',
      sheet,
      parent: { blobUrl: 'https://blob/source' },
      project: { userId: 'u1' },
      ...over,
    }) as never;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    );
  });

  it('charges 8 credits to the user, claims the sheet once and analyses in the background', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue(node(IDLE));
    prismaMock.renderNode.updateMany.mockResolvedValue({ count: 1 } as never);
    mockAnalyze.mockResolvedValue({ kind: 'lines', lines: LINES });
    const out = await requestSheetAnalysis({ nodeId: 'n2', userId: 'u1' });
    expect(out).toEqual({ kind: 'started', balance: 92 });
    expect(mockDebit).toHaveBeenCalledWith(expect.anything(), 'u1', 8);
    expect(prismaMock.renderNode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n2', sheet: { path: ['status'], equals: 'idle' } },
      }),
    );
    await vi.waitFor(() => expect(mockAnalyze).toHaveBeenCalledTimes(1));
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('gives the credits back when the analysis produces nothing', async () => {
    prismaMock.renderNode.findUnique
      .mockResolvedValueOnce(node(IDLE))
      .mockResolvedValue({ sheet: { ...IDLE, status: 'pending' } } as never);
    prismaMock.renderNode.updateMany.mockResolvedValue({ count: 1 } as never);
    mockAnalyze.mockResolvedValue({ kind: 'invalid_response' });
    await requestSheetAnalysis({ nodeId: 'n2', userId: 'u1' });
    await vi.waitFor(() => expect(mockRefund).toHaveBeenCalledWith(expect.anything(), 'u1', 8));
  });

  it('charges nothing when the sheet is already analysed or running', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue(node(READY));
    expect(await requestSheetAnalysis({ nodeId: 'n2', userId: 'u1' })).toEqual({
      kind: 'already',
      status: 'ready',
    });
    prismaMock.renderNode.findUnique.mockResolvedValue(node({ ...READY, status: 'pending' }));
    expect(await requestSheetAnalysis({ nodeId: 'n2', userId: 'u1' })).toMatchObject({
      kind: 'already',
    });
    expect(mockDebit).not.toHaveBeenCalled();
  });

  it('charges nothing without an analysis key, for another account’s image or an upload', async () => {
    mockConfigured.mockReturnValue(false);
    prismaMock.renderNode.findUnique.mockResolvedValue(node(IDLE));
    expect(await requestSheetAnalysis({ nodeId: 'n2', userId: 'u1' })).toEqual({
      kind: 'not_configured',
    });
    mockConfigured.mockReturnValue(true);
    expect(await requestSheetAnalysis({ nodeId: 'n2', userId: 'someone-else' })).toEqual({
      kind: 'not_found',
    });
    prismaMock.renderNode.findUnique.mockResolvedValue(node(null, { kind: 'UPLOADED' }));
    expect(await requestSheetAnalysis({ nodeId: 'n2', userId: 'u1' })).toEqual({
      kind: 'no_sheet',
    });
    expect(mockDebit).not.toHaveBeenCalled();
  });

  it('puts the sheet back and charges nothing when the balance does not cover it', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue(node(IDLE));
    prismaMock.renderNode.updateMany.mockResolvedValue({ count: 1 } as never);
    mockDebit.mockResolvedValue({ ok: false, reason: 'INSUFFICIENT_CREDITS', balance: 3 });
    const out = await requestSheetAnalysis({ nodeId: 'n2', userId: 'u1' });
    expect(out).toMatchObject({ kind: 'refused' });
    expect(prismaMock.renderNode.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sheet: IDLE } }),
    );
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it('a second click while the first claim stands pays nothing', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue(node(IDLE));
    prismaMock.renderNode.updateMany.mockResolvedValue({ count: 0 } as never);
    expect(await requestSheetAnalysis({ nodeId: 'n2', userId: 'u1' })).toMatchObject({
      kind: 'already',
    });
    expect(mockDebit).not.toHaveBeenCalled();
  });
});

describe('resolvePastedSheet', () => {
  const PASTED = [
    'FICHE RENDERPRO · RP-7K4M2Q',
    'Ambiance : Jour extérieur [jour_ext]',
    '- mur\nsuite → brique',
    'FIN DE LA FICHE',
  ].join('\n');

  it('leaves a text with no sheet exactly as it is', async () => {
    expect(await resolvePastedSheet('Natural daylight', 'u1')).toEqual({
      sheet: null,
      rest: 'Natural daylight',
    });
    expect(await resolvePastedSheet(undefined, 'u1')).toEqual({ sheet: null, rest: undefined });
  });

  it('takes the sheet out and falls back to the pasted lines when the code names nothing', async () => {
    prismaMock.renderNode.findFirst.mockResolvedValue(null);
    const { sheet, rest } = await resolvePastedSheet(
      `Ma précision\n\nFICHE RENDERPRO · RP-7K4M2Q\nAmbiance : Jour extérieur [jour_ext]\n- mur → brique\nFIN DE LA FICHE`,
      'u1',
    );
    expect(rest).toBe('Ma précision');
    expect(sheet).toMatchObject({
      code: 'RP-7K4M2Q',
      ambianceKey: 'jour_ext',
      lines: [{ color: 'mur', material: 'brique' }],
    });
    // Looked up among THIS user's images only.
    expect(prismaMock.renderNode.findFirst).toHaveBeenCalledWith({
      where: { code: 'RP-7K4M2Q', project: { userId: 'u1' } },
      select: { sheet: true },
    });
  });

  it('the stored sheet of the user’s own image is the authority over the pasted text', async () => {
    prismaMock.renderNode.findFirst.mockResolvedValue({ sheet: READY } as never);
    const { sheet, rest } = await resolvePastedSheet(
      'FICHE RENDERPRO · RP-7K4M2Q\n- mur → ce que quelqu’un a retouché\nFIN DE LA FICHE',
      'u1',
    );
    expect(sheet?.lines).toEqual(LINES);
    expect(sheet?.ambianceKey).toBe('nuit_ext');
    expect(rest).toBeUndefined();
  });

  it('a line is one line whatever was pasted, and an empty side drops the line', async () => {
    prismaMock.renderNode.findFirst.mockResolvedValue(null);
    const { sheet } = await resolvePastedSheet(PASTED.replace('suite', 'suite'), 'u1');
    for (const l of sheet?.lines ?? []) {
      expect(l.color).not.toMatch(/[\n\r]/);
      expect(l.material).not.toMatch(/[\n\r]/);
    }
  });
});
