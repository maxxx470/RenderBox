// node-materials: the rows of ONE node, read with a strict nodeId filter and
// errors left to the caller; one face of that node resolved by
// resolveMaterials; a correction's text normalised for storage. Prisma is
// the shared mock — no database.
import { describe, it, expect } from 'vitest';
import { prismaMock } from '@/test-utils/prisma-mock';
import {
  correctionOriginOf,
  describeNodeFace,
  describeNodeFaces,
  loadNodeMaterialRows,
  loadPromptMaterials,
  normalizeCorrectionText,
  toPromptEntries,
  type NodeMaterialRows,
} from './node-materials';

const NODE = 'node-a';
const OTHER = 'node-b';
const T0 = new Date('2026-10-12T10:00:00Z');

const detection = (face: string, valeur: string, position = 0, nodeId = NODE) => ({
  nodeId,
  face,
  valeur,
  confidence: 80,
  position,
});
const correction = (
  face: string,
  valeur: string | null,
  nodeId = NODE,
  id = `c-${face}`,
  origin = 'user',
) => ({
  id,
  nodeId,
  face,
  faceLabel: face === 'facade_principale' ? 'Façade principale' : null,
  valeur,
  origin,
  createdAt: T0,
  updatedAt: T0,
});

describe('loadNodeMaterialRows', () => {
  it('reads detections and corrections of the given node only, with the useful fields', async () => {
    prismaMock.materialDetection.findMany.mockResolvedValue([
      detection('toiture', 'Zinc'),
    ] as never);
    prismaMock.materialCorrection.findMany.mockResolvedValue([] as never);

    const rows = await loadNodeMaterialRows(NODE);

    expect(rows.detections).toHaveLength(1);
    const d = prismaMock.materialDetection.findMany.mock.calls[0]?.[0];
    const c = prismaMock.materialCorrection.findMany.mock.calls[0]?.[0];
    expect(d?.where).toEqual({ nodeId: NODE });
    expect(c?.where).toEqual({ nodeId: NODE });
    expect(Object.keys(d?.select ?? {}).sort()).toEqual(
      ['confidence', 'face', 'nodeId', 'position', 'valeur'].sort(),
    );
    expect(Object.keys(c?.select ?? {}).sort()).toEqual(
      ['createdAt', 'face', 'faceLabel', 'id', 'nodeId', 'origin', 'updatedAt', 'valeur'].sort(),
    );
  });

  it('writes nothing while reading', async () => {
    prismaMock.materialDetection.findMany.mockResolvedValue([] as never);
    prismaMock.materialCorrection.findMany.mockResolvedValue([] as never);
    await loadNodeMaterialRows(NODE);
    expect(prismaMock.materialCorrection.upsert).not.toHaveBeenCalled();
    expect(prismaMock.materialCorrection.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.materialDetectionRun.create).not.toHaveBeenCalled();
  });

  it('an image with nothing yet is two empty lists, not an error', async () => {
    prismaMock.materialDetection.findMany.mockResolvedValue([] as never);
    prismaMock.materialCorrection.findMany.mockResolvedValue([] as never);
    await expect(loadNodeMaterialRows(NODE)).resolves.toEqual({ detections: [], corrections: [] });
  });

  it('lets a database error through instead of an empty answer', async () => {
    const err = Object.assign(new Error('connection lost'), { code: 'P1001' });
    prismaMock.materialDetection.findMany.mockResolvedValue([] as never);
    prismaMock.materialCorrection.findMany.mockRejectedValue(err);
    await expect(loadNodeMaterialRows(NODE)).rejects.toBe(err);
  });
});

describe('describeNodeFace', () => {
  const rows = (r: Partial<NodeMaterialRows>): NodeMaterialRows => ({
    detections: r.detections ?? [],
    corrections: r.corrections ?? [],
  });

  it('a detection alone: its value, origin detection, its score, no correction', () => {
    expect(
      describeNodeFace(NODE, 'toiture', rows({ detections: [detection('toiture', 'Zinc')] })),
    ).toEqual({
      face: 'toiture',
      faceLabel: null,
      valeur: 'Zinc',
      origin: 'detection',
      confidence: 80,
      correction: 'none',
      correctionOrigin: null,
    });
  });

  it('a correction beats the detection of the same face, with its label and no score', () => {
    expect(
      describeNodeFace(
        NODE,
        'facade_principale',
        rows({
          detections: [detection('facade_principale', 'Enduit blanc')],
          corrections: [correction('facade_principale', 'Bardage bois')],
        }),
      ),
    ).toEqual({
      face: 'facade_principale',
      faceLabel: 'Façade principale',
      valeur: 'Bardage bois',
      origin: 'correction',
      confidence: null,
      correction: 'value',
      correctionOrigin: 'user',
    });
  });

  it('a null correction removes the detected face', () => {
    expect(
      describeNodeFace(
        NODE,
        'toiture',
        rows({
          detections: [detection('toiture', 'Zinc')],
          corrections: [correction('toiture', null)],
        }),
      ),
    ).toMatchObject({ valeur: null, origin: null, confidence: null, correction: 'removed' });
  });

  it('once the correction is gone, the detection applies again', () => {
    const detections = [detection('toiture', 'Zinc')];
    expect(
      describeNodeFace(
        NODE,
        'toiture',
        rows({ detections, corrections: [correction('toiture', 'Ardoise')] }),
      ),
    ).toMatchObject({ valeur: 'Ardoise', origin: 'correction' });
    expect(describeNodeFace(NODE, 'toiture', rows({ detections }))).toMatchObject({
      valeur: 'Zinc',
      origin: 'detection',
      correction: 'none',
    });
  });

  it('a correction-only face resolves to the correction', () => {
    expect(
      describeNodeFace(NODE, 'sol', rows({ corrections: [correction('sol', 'Béton ciré')] })),
    ).toMatchObject({ valeur: 'Béton ciré', origin: 'correction', correction: 'value' });
  });

  it('a face this image does not have: everything empty, no error', () => {
    expect(describeNodeFace(NODE, 'sol', rows({}))).toEqual({
      face: 'sol',
      faceLabel: null,
      valeur: null,
      origin: null,
      confidence: null,
      correction: 'none',
      correctionOrigin: null,
    });
  });

  it('never takes a row of another image, even if it were handed in', () => {
    expect(
      describeNodeFace(
        NODE,
        'toiture',
        rows({
          detections: [detection('toiture', 'Tuile', 0, OTHER)],
          corrections: [correction('toiture', 'Ardoise', OTHER)],
        }),
      ),
    ).toMatchObject({ valeur: null, origin: null, correction: 'none', correctionOrigin: null });
  });

  it('matches stored faces by their canonical key', () => {
    expect(
      describeNodeFace(
        NODE,
        'facade_principale',
        rows({ detections: [detection('Façade principale', 'Pierre')] }),
      ),
    ).toMatchObject({ valeur: 'Pierre', origin: 'detection' });
  });
});

describe('loadPromptMaterials', () => {
  it('reads this node only and resolves: a correction replaces, a null removes, the rest stays', async () => {
    prismaMock.materialDetection.findMany.mockResolvedValue([
      detection('facade_principale', 'Enduit blanc', 0),
      detection('toiture', 'Tuile', 1),
      detection('sol', 'Parquet', 2),
    ] as never);
    prismaMock.materialCorrection.findMany.mockResolvedValue([
      correction('facade_principale', 'Bardage bois'),
      correction('toiture', null),
    ] as never);

    await expect(loadPromptMaterials(NODE)).resolves.toEqual([
      { face: 'facade_principale', valeur: 'Bardage bois', origin: 'correction', nodeId: NODE },
      { face: 'sol', valeur: 'Parquet', origin: 'detection', nodeId: NODE, confidence: 80 },
    ]);
    expect(prismaMock.materialDetection.findMany.mock.calls[0]?.[0]?.where).toEqual({
      nodeId: NODE,
    });
    expect(prismaMock.materialCorrection.findMany.mock.calls[0]?.[0]?.where).toEqual({
      nodeId: NODE,
    });
  });

  it('keeps out what a prompt line would leave empty, as buildGenerationPrompt does', async () => {
    // U+0085 survives String#trim but is a line break for toPromptLine.
    const NEL = String.fromCharCode(0x85);
    prismaMock.materialDetection.findMany.mockResolvedValue([
      detection('sol', NEL, 0),
      detection('toiture', 'Zinc', 1),
    ] as never);
    prismaMock.materialCorrection.findMany.mockResolvedValue([] as never);
    const list = await loadPromptMaterials(NODE);
    expect(list.map((m) => m.face)).toEqual(['toiture']);
  });

  it('nothing for this image is an empty list', async () => {
    prismaMock.materialDetection.findMany.mockResolvedValue([] as never);
    prismaMock.materialCorrection.findMany.mockResolvedValue([] as never);
    await expect(loadPromptMaterials(NODE)).resolves.toEqual([]);
  });

  it('lets a read error through: never a partial list', async () => {
    const err = Object.assign(new Error('connection lost'), { code: 'P1001' });
    prismaMock.materialDetection.findMany.mockRejectedValue(err);
    prismaMock.materialCorrection.findMany.mockResolvedValue([
      correction('toiture', 'Ardoise'),
    ] as never);
    await expect(loadPromptMaterials(NODE)).rejects.toBe(err);
  });
});

describe('toPromptEntries', () => {
  it('maps resolved materials to the prompt builder shape, a correction without a score', () => {
    expect(
      toPromptEntries([
        { face: 'sol', valeur: 'Parquet', origin: 'detection', nodeId: NODE, confidence: 60 },
        { face: 'toiture', valeur: 'Ardoise', origin: 'correction', nodeId: NODE },
      ]),
    ).toEqual([
      { face: 'sol', valeur: 'Parquet', source: 'detection', confidence: 60 },
      { face: 'toiture', valeur: 'Ardoise', source: 'correction', confidence: null },
    ]);
  });
});

describe('normalizeCorrectionText', () => {
  const CR = String.fromCharCode(13);
  const LF = String.fromCharCode(10);
  const LS = String.fromCharCode(0x2028);

  it('turns line breaks (CRLF, CR, LF, LS) into spaces and collapses runs of spaces', () => {
    expect(
      normalizeCorrectionText(`Bardage${CR}${LF}bois${CR}clair${LF}${LF}  naturel${LS}huilé`),
    ).toBe('Bardage bois clair naturel huilé');
  });

  it('trims, collapses tabs and spaces, and never joins words', () => {
    expect(normalizeCorrectionText('  Enduit \t  gratté   blanc  ')).toBe('Enduit gratté blanc');
  });

  it('keeps accents, punctuation and symbols', () => {
    expect(normalizeCorrectionText('Pierre « de Bourgogne » : 30° & “mat”')).toBe(
      'Pierre « de Bourgogne » : 30° & “mat”',
    );
  });

  it('blank input becomes an empty string', () => {
    expect(normalizeCorrectionText(` ${LF}\t${CR} `)).toBe('');
  });
});

describe('correctionOrigin — where the correction of a face comes from (3C.5.5)', () => {
  const rows = (r: Partial<NodeMaterialRows>): NodeMaterialRows => ({
    detections: r.detections ?? [],
    corrections: r.corrections ?? [],
  });
  const attached = (face: string, valeur: string | null) =>
    correction(face, valeur, NODE, `c-${face}`, 'legacy_attach');

  it('a row of the old sheet attached and untouched: legacy_attach, as stored', () => {
    expect(
      describeNodeFace(
        NODE,
        'toiture',
        rows({
          detections: [detection('toiture', 'Zinc')],
          corrections: [attached('toiture', 'Tuile')],
        }),
      ),
    ).toMatchObject({
      valeur: 'Tuile',
      origin: 'correction',
      correction: 'value',
      correctionOrigin: 'legacy_attach',
    });
  });

  it('the same row once the user changed it (stored "user" by the PUT): the user’s, no longer the old sheet’s', () => {
    expect(
      describeNodeFace(NODE, 'toiture', rows({ corrections: [correction('toiture', 'Ardoise')] })),
    ).toMatchObject({ valeur: 'Ardoise', correction: 'value', correctionOrigin: 'user' });
  });

  it('an attached correction deleted: no correction, no origin, the detection back', () => {
    expect(
      describeNodeFace(NODE, 'toiture', rows({ detections: [detection('toiture', 'Zinc')] })),
    ).toMatchObject({
      valeur: 'Zinc',
      origin: 'detection',
      correction: 'none',
      correctionOrigin: null,
    });
  });

  it('a correction the user typed: user', () => {
    expect(
      describeNodeFace(NODE, 'sol', rows({ corrections: [correction('sol', 'Béton')] })),
    ).toMatchObject({ correction: 'value', correctionOrigin: 'user' });
  });

  it('a detected value with no correction: no correction origin', () => {
    expect(
      describeNodeFace(NODE, 'toiture', rows({ detections: [detection('toiture', 'Zinc')] })),
    ).toMatchObject({ origin: 'detection', correction: 'none', correctionOrigin: null });
  });

  it('a masked face: a removal, the user’s', () => {
    expect(
      describeNodeFace(
        NODE,
        'toiture',
        rows({
          detections: [detection('toiture', 'Zinc')],
          corrections: [correction('toiture', null)],
        }),
      ),
    ).toMatchObject({
      valeur: null,
      origin: null,
      correction: 'removed',
      correctionOrigin: 'user',
    });
  });

  it('decided by the stored origin alone — an equal value typed by the user stays the user’s', () => {
    const list = describeNodeFaces(
      NODE,
      rows({ corrections: [attached('toiture', 'Tuile'), correction('sol', 'Tuile')] }),
    );
    expect(Object.fromEntries(list.map((i) => [i.face, i.correctionOrigin]))).toEqual({
      toiture: 'legacy_attach',
      sol: 'user',
    });
  });

  it('a stored origin it does not know is the user’s, never the old sheet’s', () => {
    expect(correctionOriginOf('legacy_attach')).toBe('legacy_attach');
    expect(correctionOriginOf('user')).toBe('user');
    expect(correctionOriginOf('')).toBe('user');
    expect(correctionOriginOf('LEGACY_ATTACH')).toBe('user');
  });
});
