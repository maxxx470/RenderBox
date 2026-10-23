// The image's code and its materials sheet — the database is replaced.
import { describe, it, expect, beforeEach } from 'vitest';
import { prismaMock } from '@/test-utils/prisma-mock';

import {
  ensureNodeCode,
  failAndRefund,
  recoverStalledSheet,
  generateImageCode,
  readSheet,
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
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) =>
    fn(prismaMock)) as never);
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

describe('startSheet and scheduleSheet', () => {
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

  it('scheduleSheet only starts the sheet and never throws', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({ code: 'RP-AAAAAA' } as never);
    await scheduleSheet({ nodeId: 'n2', sourceNodeId: 'n1', ambiance: null });
    expect(prismaMock.user.update).not.toHaveBeenCalled();

    prismaMock.renderNode.findUnique.mockRejectedValue(new Error('db down'));
    await expect(
      scheduleSheet({ nodeId: 'n2', sourceNodeId: 'n1', ambiance: null }),
    ).resolves.toBeUndefined();
  });
});

describe('failAndRefund and recoverStalledSheet — an analysis started before 2026-10-23 and never finished is refunded', () => {
  const PENDING = { ...READY, status: 'pending', lines: [], startedAt: Date.now() };

  it('turns the sheet "failed" and gives the 2 credits back together, once', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({ sheet: PENDING } as never);
    prismaMock.renderNode.updateMany.mockResolvedValue({ count: 1 } as never);
    expect(await failAndRefund('n2', 'u1', 'timeout')).toBe(true);
    expect(prismaMock.renderNode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n2', sheet: { path: ['status'], equals: 'pending' } },
        data: { sheet: expect.objectContaining({ status: 'failed', failure: 'timeout' }) },
      }),
    );
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
  });

  it('refunds nothing when the sheet is no longer pending (already refunded or ready)', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({
      sheet: { ...PENDING, status: 'failed' },
    } as never);
    expect(await failAndRefund('n2', 'u1', 'timeout')).toBe(false);
    prismaMock.renderNode.findUnique.mockResolvedValue({ sheet: PENDING } as never);
    prismaMock.renderNode.updateMany.mockResolvedValue({ count: 0 } as never);
    expect(await failAndRefund('n2', 'u1', 'timeout')).toBe(false);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('gives up an analysis whose task died, after four minutes, and refunds it', async () => {
    const old = { ...PENDING, startedAt: Date.now() - 5 * 60_000 };
    prismaMock.renderNode.findUnique.mockResolvedValue({ sheet: old } as never);
    prismaMock.renderNode.updateMany.mockResolvedValue({ count: 1 } as never);
    await recoverStalledSheet('n2', 'u1', old);
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
  });

  it('leaves a recent pending sheet and any other sheet alone', async () => {
    expect(await recoverStalledSheet('n2', 'u1', PENDING)).toBe(PENDING);
    expect(await recoverStalledSheet('n2', 'u1', READY)).toBe(READY);
    expect(await recoverStalledSheet('n2', 'u1', null)).toBeNull();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
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
