// detectAndMergeMaterials: how a detection lands in the project's materials
// sheet — never over a value the user typed, by confidence otherwise, never a
// deletion — and what happens when the detection is missing or fails. The
// vision call is mocked (no SDK, no network) and Prisma is the shared mock.
//
// Where it is called from (generate on the result, edit on the first result
// of an annotate only, never enhance) is asserted in the route tests.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '@/test-utils/prisma-mock';

const { mockDetectMaterials, mockWarn, FakeVisionNotConfiguredError } = vi.hoisted(() => ({
  mockDetectMaterials: vi.fn(),
  mockWarn: vi.fn(),
  FakeVisionNotConfiguredError: class VisionNotConfiguredError extends Error {},
}));

vi.mock('@/lib/server/ai/vision-materials', () => ({
  detectMaterials: mockDetectMaterials,
  VisionNotConfiguredError: FakeVisionNotConfiguredError,
}));
vi.mock('@/lib/server/observability/log', () => ({
  log: { warn: mockWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { detectAndMergeMaterials, LEGACY_DETECTION_DEADLINE_MS } from './detect-and-merge';

const PROJECT_ID = 'project-1';
const IMAGE = Buffer.from('rendered-image');

function upsertCalls() {
  return prismaMock.material.upsert.mock.calls.map((c) => c[0]);
}

beforeEach(() => {
  mockDetectMaterials.mockReset();
  mockWarn.mockReset();
  prismaMock.material.findMany.mockResolvedValue([]);
  prismaMock.material.upsert.mockResolvedValue({} as never);
});

describe('detectAndMergeMaterials — detection outcomes', () => {
  it('hands the image and its MIME type to the detector, with a 30 s deadline (étape 3B.4)', async () => {
    mockDetectMaterials.mockResolvedValue([]);
    await detectAndMergeMaterials(PROJECT_ID, IMAGE, 'image/jpeg');
    expect(LEGACY_DETECTION_DEADLINE_MS).toBe(30_000);
    expect(mockDetectMaterials).toHaveBeenCalledWith(IMAGE, 'image/jpeg', { deadlineMs: 30_000 });
  });

  it('lets a detection timeout through, and writes nothing (the routes log it as non-fatal)', async () => {
    const err = Object.assign(new Error('Claude Vision did not answer within 30 s'), {
      name: 'VisionTimeoutError',
    });
    mockDetectMaterials.mockRejectedValue(err);
    await expect(detectAndMergeMaterials(PROJECT_ID, IMAGE, 'image/png')).rejects.toBe(err);
    expect(prismaMock.material.findMany).not.toHaveBeenCalled();
    expect(prismaMock.material.upsert).not.toHaveBeenCalled();
  });

  it('does nothing, without throwing, when the detector is not configured', async () => {
    mockDetectMaterials.mockRejectedValue(new FakeVisionNotConfiguredError('no key'));
    await expect(detectAndMergeMaterials(PROJECT_ID, IMAGE, 'image/png')).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(prismaMock.material.findMany).not.toHaveBeenCalled();
    expect(prismaMock.material.upsert).not.toHaveBeenCalled();
  });

  it('lets any other detection error through, and writes nothing', async () => {
    const err = new Error('vision down');
    mockDetectMaterials.mockRejectedValue(err);
    await expect(detectAndMergeMaterials(PROJECT_ID, IMAGE, 'image/png')).rejects.toBe(err);
    expect(prismaMock.material.upsert).not.toHaveBeenCalled();
  });

  it('reads nothing and writes nothing when nothing is detected', async () => {
    mockDetectMaterials.mockResolvedValue([]);
    await detectAndMergeMaterials(PROJECT_ID, IMAGE, 'image/png');
    expect(prismaMock.material.findMany).not.toHaveBeenCalled();
    expect(prismaMock.material.upsert).not.toHaveBeenCalled();
  });
});

describe('detectAndMergeMaterials — merge rules', () => {
  it('reads the whole project once, then upserts one row per detected face, keyed by project and face', async () => {
    mockDetectMaterials.mockResolvedValue([
      { face: 'facade_principale', valeur: 'Bardage bois', confidence: 80 },
      { face: 'toiture', valeur: 'Zinc', confidence: 70 },
    ]);
    await detectAndMergeMaterials(PROJECT_ID, IMAGE, 'image/png');
    expect(prismaMock.material.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.material.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: PROJECT_ID } }),
    );
    expect(upsertCalls().map((c) => c.where)).toEqual([
      { projectId_face: { projectId: PROJECT_ID, face: 'facade_principale' } },
      { projectId_face: { projectId: PROJECT_ID, face: 'toiture' } },
    ]);
  });

  it('creates a new face as an automatic detection with its confidence', async () => {
    mockDetectMaterials.mockResolvedValue([
      { face: 'menuiseries', valeur: 'Aluminium noir', confidence: 88 },
    ]);
    await detectAndMergeMaterials(PROJECT_ID, IMAGE, 'image/png');
    expect(upsertCalls()[0]?.create).toEqual({
      projectId: PROJECT_ID,
      face: 'menuiseries',
      valeur: 'Aluminium noir',
      source: 'auto',
      confidence: 88,
    });
  });

  it('never overwrites a value typed by the user, whatever the confidence', async () => {
    prismaMock.material.findMany.mockResolvedValue([
      { face: 'toiture', valeur: 'Ardoise', source: 'manuel', confidence: null },
    ] as never);
    mockDetectMaterials.mockResolvedValue([{ face: 'toiture', valeur: 'Zinc', confidence: 100 }]);
    await detectAndMergeMaterials(PROJECT_ID, IMAGE, 'image/png');
    expect(upsertCalls()[0]?.update).toEqual({
      valeur: 'Ardoise',
      source: 'manuel',
      confidence: null,
    });
  });

  it.each([
    ['replaces', 60, 80, { valeur: 'Bardage bois', source: 'auto', confidence: 80 }],
    ['keeps', 90, 80, { valeur: 'Enduit', source: 'auto', confidence: 90 }],
    [
      'keeps (equal confidence is not enough)',
      80,
      80,
      { valeur: 'Enduit', source: 'auto', confidence: 80 },
    ],
  ])(
    '%s an automatic value detected at %i when the new one is at %i',
    async (_l, before, after, expected) => {
      prismaMock.material.findMany.mockResolvedValue([
        { face: 'facade_principale', valeur: 'Enduit', source: 'auto', confidence: before },
      ] as never);
      mockDetectMaterials.mockResolvedValue([
        { face: 'facade_principale', valeur: 'Bardage bois', confidence: after },
      ]);
      await detectAndMergeMaterials(PROJECT_ID, IMAGE, 'image/png');
      expect(upsertCalls()[0]?.update).toEqual(expected);
    },
  );

  it('replaces an automatic value that has no confidence by any detection', async () => {
    prismaMock.material.findMany.mockResolvedValue([
      { face: 'sol', valeur: 'Béton', source: 'auto', confidence: null },
    ] as never);
    mockDetectMaterials.mockResolvedValue([
      { face: 'sol', valeur: 'Parquet chêne', confidence: 1 },
    ]);
    await detectAndMergeMaterials(PROJECT_ID, IMAGE, 'image/png');
    expect(upsertCalls()[0]?.update).toEqual({
      valeur: 'Parquet chêne',
      source: 'auto',
      confidence: 1,
    });
  });

  it('never deletes a face that is no longer detected (the sheet only grows)', async () => {
    prismaMock.material.findMany.mockResolvedValue([
      { face: 'toiture', valeur: 'Tuile', source: 'auto', confidence: 70 },
    ] as never);
    mockDetectMaterials.mockResolvedValue([{ face: 'sol', valeur: 'Béton', confidence: 70 }]);
    await detectAndMergeMaterials(PROJECT_ID, IMAGE, 'image/png');
    expect(upsertCalls()).toHaveLength(1);
    expect(upsertCalls()[0]?.where).toEqual({
      projectId_face: { projectId: PROJECT_ID, face: 'sol' },
    });
    expect(prismaMock.material.delete).not.toHaveBeenCalled();
    expect(prismaMock.material.deleteMany).not.toHaveBeenCalled();
  });
});
