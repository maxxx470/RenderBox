// Phase 5 — payload validation (add_element needs a reference image,
// targeted_retouch needs a zone, variantCount is 1-4), editing an uploaded
// photo without an ambiance, multi-variant creation (N RenderNodes, N-unit rate-limit
// charge), and the moderation gate on the reference image.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyToken: vi.fn() };
});

const {
  mockEnforceGenerationRateLimit,
  mockGenerate,
  mockIsEngineConfigured,
  mockModerateImage,
  mockDebitCredits,
  mockRefundCredits,
  mockDetectMaterials,
} = vi.hoisted(() => ({
  mockEnforceGenerationRateLimit: vi.fn(),
  mockGenerate: vi.fn(),
  mockIsEngineConfigured: vi.fn(),
  mockModerateImage: vi.fn(),
  mockDebitCredits: vi.fn(),
  mockRefundCredits: vi.fn(),
  mockDetectMaterials: vi.fn(),
}));

vi.mock('@/lib/server/materials/detect-and-merge', () => ({
  detectAndMergeMaterials: mockDetectMaterials,
}));

vi.mock('@/lib/server/middleware/rate-limit-generation', () => ({
  enforceGenerationRateLimit: mockEnforceGenerationRateLimit,
}));

vi.mock('@/lib/server/generation/tier-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/generation/tier-quota')>()),
  debitCredits: mockDebitCredits,
  refundCredits: mockRefundCredits,
}));

vi.mock('@/lib/server/generation/engines', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/generation/engines')>(
    '@/lib/server/generation/engines',
  );
  return {
    ...actual,
    generateRender: mockGenerate,
    isEngineConfigured: mockIsEngineConfigured,
  };
});

vi.mock('@/lib/server/upload/vercel-blob-client', () => ({
  uploadBuffer: vi.fn().mockResolvedValue({ blobUrl: 'https://blob.test/out.png', bytes: 123 }),
  StorageNotConfiguredError: class StorageNotConfiguredError extends Error {},
}));

vi.mock('@/lib/server/moderation/moderate-image', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/moderation/moderate-image')>(
    '@/lib/server/moderation/moderate-image',
  );
  return { ...actual, moderateImage: mockModerateImage };
});

import { verifyToken } from '@/lib/server/auth';
import { POST, maxDuration } from './route';
import { EngineTimeoutError } from '@/lib/server/generation/engines';
import { PRESETS } from '@/lib/server/generation/presets';

const USER_ID = 'user-1';
const PROJECT_ID = 'project-1';
const SOURCE_NODE_ID = 'node-generated';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function makeReq(fields: Record<string, string>, referenceFile?: File): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (referenceFile) form.append('referenceImage', referenceFile);

  return new NextRequest(`https://test/api/projects/${PROJECT_ID}/edit`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-access-token',
      'x-csrf-token': 'csrf-tok',
      cookie: 'app-csrf=csrf-tok',
    },
    body: form,
  });
}

function pngFile(name = 'ref.png'): File {
  return new File([PNG_BYTES], name, { type: 'image/png' });
}

function baseFields(overrides: Record<string, string> = {}) {
  return {
    sourceNodeId: SOURCE_NODE_ID,
    editType: 'targeted_retouch',
    instruction: 'ajoute une fenetre',
    variantCount: '1',
    engine: 'nanobanana',
    zone: JSON.stringify({ x: 10, y: 10, width: 20, height: 20 }),
    ...overrides,
  };
}

function ctx() {
  return { params: Promise.resolve({ projectId: PROJECT_ID }) };
}

const T0 = new Date('2026-10-12T10:00:00Z');

interface DetectionRow {
  nodeId: string;
  face: string;
  valeur: string;
  confidence: number;
  position: number;
}
interface CorrectionRow {
  id: string;
  nodeId: string;
  face: string;
  faceLabel: string | null;
  valeur: string | null;
  createdAt: Date;
  updatedAt: Date;
}
const detection = (
  nodeId: string,
  face: string,
  valeur: string,
  position = 0,
  confidence = 80,
): DetectionRow => ({ nodeId, face, valeur, confidence, position });
const correction = (nodeId: string, face: string, valeur: string | null): CorrectionRow => ({
  id: `c-${nodeId}-${face}`,
  nodeId,
  face,
  faceLabel: null,
  valeur,
  createdAt: T0,
  updatedAt: T0,
});

/** The Phase 7 tables, answered as the database would: only the asked node's rows. */
function imageMaterials(detections: DetectionRow[] = [], corrections: CorrectionRow[] = []) {
  prismaMock.materialDetection.findMany.mockImplementation((async (args: {
    where: { nodeId: string };
  }) => detections.filter((d) => d.nodeId === args.where.nodeId)) as never);
  prismaMock.materialCorrection.findMany.mockImplementation((async (args: {
    where: { nodeId: string };
  }) => corrections.filter((c) => c.nodeId === args.where.nodeId)) as never);
}

beforeEach(() => {
  __cookieStore.clear();
  vi.mocked(verifyToken).mockReset();
  mockGenerate.mockReset();
  mockIsEngineConfigured.mockReset().mockReturnValue(true);
  mockEnforceGenerationRateLimit.mockReset().mockResolvedValue(null);
  mockDebitCredits.mockReset().mockResolvedValue({ ok: true, balance: 2850 });
  mockRefundCredits.mockReset().mockResolvedValue(undefined);
  mockModerateImage.mockReset().mockResolvedValue({ flagged: false, categories: [] });
  mockDetectMaterials.mockReset().mockResolvedValue(undefined);
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';

  vi.mocked(verifyToken).mockResolvedValue({
    sub: USER_ID,
    email: 'owner@test.local',
    tokenVersion: 0,
  });
  prismaMock.user.findUnique.mockResolvedValue({
    id: USER_ID,
    email: 'owner@test.local',
    tokenVersion: 0,
  } as never);
  prismaMock.project.findUnique.mockResolvedValue({ userId: USER_ID } as never);
  prismaMock.renderNode.findUnique.mockResolvedValue({
    id: SOURCE_NODE_ID,
    projectId: PROJECT_ID,
    blobUrl: 'https://blob.test/source.png',
    mimeType: 'image/png',
    kind: 'GENERATED',
    preset: 'jour_ext',
  } as never);
  prismaMock.material.findMany.mockResolvedValue([]);
  imageMaterials();
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  let nodeCounter = 0;
  prismaMock.renderNode.create.mockImplementation(
    () => Promise.resolve({ id: `node-new-${++nodeCounter}` }) as never,
  );
  prismaMock.generation.create.mockResolvedValue({ id: 'gen-1' } as never);
  prismaMock.renderNode.findMany.mockResolvedValue([]);

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
  }) as unknown as typeof fetch;

  mockGenerate.mockResolvedValue({ imageBuffer: Buffer.from('img'), mimeType: 'image/png' });
});

describe('POST /api/projects/[projectId]/edit — validation', () => {
  it('400s when add_element has no referenceImage', async () => {
    const res = await POST(makeReq(baseFields({ editType: 'add_element', zone: '' })), ctx());
    expect(res.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('400s when targeted_retouch has no zone', async () => {
    const res = await POST(makeReq(baseFields({ zone: '' })), ctx());
    expect(res.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('400s when the zone is out of bounds', async () => {
    const res = await POST(
      makeReq(baseFields({ zone: JSON.stringify({ x: 90, y: 10, width: 20, height: 10 }) })),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('400s when variantCount is out of the 1-4 range', async () => {
    const res = await POST(makeReq(baseFields({ variantCount: '5' })), ctx());
    expect(res.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('edits an UPLOADED photo too, without imposing an ambiance on it', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({
      id: SOURCE_NODE_ID,
      projectId: PROJECT_ID,
      blobUrl: 'https://blob.test/source.png',
      mimeType: 'image/png',
      kind: 'UPLOADED',
      preset: null,
    } as never);
    const res = await POST(
      makeReq(baseFields({ editType: 'add_element', zone: '' }), pngFile()),
      ctx(),
    );
    expect(res.status).toBe(201);
    const input = mockGenerate.mock.calls[0]?.[1] as { prompt: string };
    expect(input.prompt).toContain('Add the following element');
    expect(input.prompt).not.toContain('full daylight');
    expect(prismaMock.renderNode.create.mock.calls[0]?.[0]?.data).toMatchObject({
      parentId: SOURCE_NODE_ID,
      preset: null,
    });
  });
});

describe('POST /api/projects/[projectId]/edit — ambiance of the source', () => {
  it('does not run a transformation ambiance again on its own result, but keeps its name', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({
      id: SOURCE_NODE_ID,
      projectId: PROJECT_ID,
      blobUrl: 'https://blob.test/source.png',
      mimeType: 'image/png',
      kind: 'GENERATED',
      preset: 'plan_3d',
    } as never);
    const res = await POST(
      makeReq(baseFields({ editType: 'add_element', zone: '' }), pngFile()),
      ctx(),
    );
    expect(res.status).toBe(201);
    const input = mockGenerate.mock.calls[0]?.[1] as { prompt: string };
    expect(input.prompt).not.toContain('2D floor plan');
    expect(input.prompt).toContain('Keep everything else in the image exactly as it is');
    expect(prismaMock.renderNode.create.mock.calls[0]?.[0]?.data).toMatchObject({
      preset: 'plan_3d',
    });
  });

  it('relights an edit of a day render the same way', async () => {
    const res = await POST(
      makeReq(baseFields({ editType: 'add_element', zone: '' }), pngFile()),
      ctx(),
    );
    expect(res.status).toBe(201);
    const input = mockGenerate.mock.calls[0]?.[1] as { prompt: string };
    expect(input.prompt).toContain('full daylight');
  });
});

describe('POST /api/projects/[projectId]/edit — multi-variant', () => {
  it('creates N RenderNodes with the same parentId, charges the rate limit N units, and debits N × 50 credits up front', async () => {
    const res = await POST(makeReq(baseFields({ variantCount: '3' })), ctx());
    expect(res.status).toBe(201);
    const body = (await res.json()) as { createdCount: number; requestedCount: number };
    expect(body.requestedCount).toBe(3);
    expect(body.createdCount).toBe(3);
    expect(mockGenerate).toHaveBeenCalledTimes(3);
    expect(mockEnforceGenerationRateLimit).toHaveBeenCalledWith(USER_ID, 3);
    expect(mockDebitCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 150);
    expect(mockDebitCredits.mock.invocationCallOrder[0]).toBeLessThan(
      mockGenerate.mock.invocationCallOrder[0]!,
    );
    expect(mockRefundCredits).not.toHaveBeenCalled();
    expect(prismaMock.renderNode.create).toHaveBeenCalledTimes(3);
    for (const call of prismaMock.renderNode.create.mock.calls) {
      expect(call[0]?.data).toMatchObject({ parentId: SOURCE_NODE_ID, kind: 'GENERATED' });
    }
  });

  it('429s before any engine call when the rate limit rejects', async () => {
    const { NextResponse } = await import('next/server');
    mockEnforceGenerationRateLimit.mockResolvedValue(
      NextResponse.json({ error: 'GENERATION_DAILY_LIMIT_EXCEEDED' }, { status: 429 }),
    );
    const res = await POST(makeReq(baseFields({ variantCount: '4' })), ctx());
    expect(res.status).toBe(429);
    expect(mockGenerate).not.toHaveBeenCalled();
    // The 4 × 50 debited just before the limiter come back.
    expect(mockRefundCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 200);
  });

  it('reports partial success when some variants fail to generate, and refunds the variant that failed', async () => {
    mockGenerate
      .mockResolvedValueOnce({ imageBuffer: Buffer.from('a'), mimeType: 'image/png' })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ imageBuffer: Buffer.from('c'), mimeType: 'image/png' });

    const res = await POST(makeReq(baseFields({ variantCount: '3' })), ctx());
    expect(res.status).toBe(201);
    const body = (await res.json()) as { createdCount: number; requestedCount: number };
    expect(body.requestedCount).toBe(3);
    expect(body.createdCount).toBe(2);
    expect(mockDebitCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 150);
    expect(mockRefundCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 50);
  });

  it('502s when every variant fails to generate, and refunds every credit', async () => {
    mockGenerate.mockRejectedValue(new Error('boom'));
    const res = await POST(makeReq(baseFields({ variantCount: '2' })), ctx());
    expect(res.status).toBe(502);
    expect(mockRefundCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 100);
  });

  it('prices N variants at 4K at N × 70', async () => {
    const res = await POST(makeReq(baseFields({ variantCount: '2', resolution: '4k' })), ctx());
    expect(res.status).toBe(201);
    expect(mockDebitCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 140);
  });
});

describe('POST /api/projects/[projectId]/edit — credits', () => {
  it('403s with NO_ACTIVE_TIER before any engine call', async () => {
    mockDebitCredits.mockResolvedValue({ ok: false, reason: 'NO_ACTIVE_TIER', balance: null });
    const res = await POST(makeReq(baseFields()), ctx());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('NO_ACTIVE_TIER');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('402s with INSUFFICIENT_CREDITS when the batch would overshoot the balance', async () => {
    mockDebitCredits.mockResolvedValue({ ok: false, reason: 'INSUFFICIENT_CREDITS', balance: 100 });
    const res = await POST(makeReq(baseFields({ variantCount: '3' })), ctx());
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: 'INSUFFICIENT_CREDITS', cost: 150 });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockEnforceGenerationRateLimit).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/[projectId]/edit — add_element + moderation', () => {
  it('happy path: uploads reference image, passes it to generateRender, creates the node', async () => {
    const res = await POST(
      makeReq(baseFields({ editType: 'add_element', zone: '' }), pngFile()),
      ctx(),
    );
    expect(res.status).toBe(201);
    expect(mockModerateImage).toHaveBeenCalledTimes(1);
    const call = mockGenerate.mock.calls[0]?.[1] as { referenceImages?: unknown[] };
    expect(call.referenceImages).toHaveLength(1);
  });

  it('422s when the reference image is flagged by moderation, before any engine call', async () => {
    mockModerateImage.mockResolvedValue({ flagged: true, categories: ['violence'] });
    const res = await POST(
      makeReq(baseFields({ editType: 'add_element', zone: '' }), pngFile()),
      ctx(),
    );
    expect(res.status).toBe(422);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('503s with MODERATION_NOT_CONFIGURED when moderation cannot run', async () => {
    const { ModerationNotConfiguredError } = await import('@/lib/server/moderation/moderate-image');
    mockModerateImage.mockRejectedValue(new ModerationNotConfiguredError());
    const res = await POST(
      makeReq(baseFields({ editType: 'add_element', zone: '' }), pngFile()),
      ctx(),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('MODERATION_NOT_CONFIGURED');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('415s on a magic-byte mismatch for the reference image', async () => {
    const badFile = new File([Buffer.from('not a real png')], 'ref.png', { type: 'image/png' });
    const res = await POST(
      makeReq(baseFields({ editType: 'add_element', zone: '' }), badFile),
      ctx(),
    );
    expect(res.status).toBe(415);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/[projectId]/edit — annotate (point-and-comment)', () => {
  const annotations = JSON.stringify([
    { x: 20, y: 40, comment: 'Façade en bardage bois' },
    { x: 70, y: 85, comment: 'Sol en pierre claire' },
  ]);

  function annotateReq(fields: Record<string, string>, marked?: File): NextRequest {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    if (marked) form.append('markedImage', marked);
    return new NextRequest(`https://test/api/projects/${PROJECT_ID}/edit`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access-token',
        'x-csrf-token': 'csrf-tok',
        cookie: 'app-csrf=csrf-tok',
      },
      body: form,
    });
  }

  const fields: Record<string, string> = {
    sourceNodeId: SOURCE_NODE_ID,
    editType: 'annotate',
    variantCount: '1',
    engine: 'nanobanana',
    annotations,
  };

  it('runs on gpt_image even when the client asks for nanobanana, with no instruction needed', async () => {
    const res = await POST(annotateReq(fields), ctx());
    expect(res.status).toBe(201);
    expect(mockGenerate.mock.calls[0]?.[0]).toBe('gpt_image');
    expect(mockIsEngineConfigured).toHaveBeenCalledWith('gpt_image');
    const input = mockGenerate.mock.calls[0]?.[1] as { prompt: string };
    expect(input.prompt).toContain('1. At 20% from the left, 40% from the top');
    expect(input.prompt).toContain('Sol en pierre claire');
    expect(prismaMock.renderNode.create.mock.calls[0]?.[0]?.data).toMatchObject({
      engine: 'gpt_image',
      editType: 'annotate',
    });
  });

  it('400s without annotations, and on invalid annotations JSON', async () => {
    const withoutAnnotations = { ...fields };
    delete withoutAnnotations.annotations;
    expect((await POST(annotateReq(withoutAnnotations), ctx())).status).toBe(400);
    expect((await POST(annotateReq({ ...fields, annotations: '{oops' }), ctx())).status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('passes the marked copy as a reference image after moderating it', async () => {
    const res = await POST(annotateReq(fields, pngFile('marked.png')), ctx());
    expect(res.status).toBe(201);
    expect(mockModerateImage).toHaveBeenCalledTimes(1);
    const input = mockGenerate.mock.calls[0]?.[1] as {
      referenceImages?: unknown[];
      prompt: string;
    };
    expect(input.referenceImages).toHaveLength(1);
    expect(input.prompt).toContain('numbered markers');
  });

  // 2026-10-18: production has no OPENAI_API_KEY; every comment was refused.
  it('leaves the marked copy out, unsent, when moderation cannot run — the comment still runs', async () => {
    const { ModerationNotConfiguredError } = await import('@/lib/server/moderation/moderate-image');
    mockModerateImage.mockRejectedValue(new ModerationNotConfiguredError());
    const res = await POST(annotateReq(fields, pngFile('marked.png')), ctx());
    expect(res.status).toBe(201);
    const input = mockGenerate.mock.calls[0]?.[1] as {
      referenceImages?: unknown[];
      prompt: string;
    };
    expect(input.referenceImages).toBeUndefined();
    expect(input.prompt).not.toContain('numbered markers');
    expect(input.prompt).toContain('1. At 20% from the left, 40% from the top');
  });

  it('refuses a marked copy whose bytes are not an image', async () => {
    const bad = new File([Buffer.from('not a png')], 'marked.png', { type: 'image/png' });
    const res = await POST(annotateReq(fields, bad), ctx());
    expect(res.status).toBe(415);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('re-reads the materials from the result, and a detection failure does not fail the edit', async () => {
    mockDetectMaterials.mockRejectedValue(new Error('vision down'));
    const res = await POST(annotateReq(fields), ctx());
    expect(res.status).toBe(201);
    expect(mockDetectMaterials).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { materialsDetected: boolean };
    expect(body.materialsDetected).toBe(false);
  });

  it('never re-reads materials for the other edit types', async () => {
    await POST(makeReq(baseFields()), ctx());
    expect(mockDetectMaterials).not.toHaveBeenCalled();
  });
});

// Étape 2B (non-regression): what the engine actually receives from an edit —
// exact prompt, engine, source then reference, ratio and size — for the two
// Ajouter paths and for Commenter. Current behaviours are documented as they
// are, not fixed (the missing preservation sentence: audit F4).
describe('POST /api/projects/[projectId]/edit — what reaches the engine', () => {
  const SOURCE_BYTES = Buffer.from('source-node-bytes');
  // A row of the project's old sheet (étape 3D sent it); since étape 3C.3 the
  // same material reaches the prompt only as a correction on the source image.
  const MATERIAL_ROWS = [
    {
      face: 'facade_principale',
      valeur: 'Enduit blanc taloché',
      source: 'manuel',
      confidence: null,
    },
  ];
  const MATERIAL_LINES = [
    "Materials recorded for this source image. Preserve each listed material by default. If the user's request explicitly changes a listed material, apply the requested change only to that material; preserve every other listed material unchanged unless the user explicitly requests otherwise:",
    '- facade_principale: Enduit blanc taloché',
  ];
  const ADD_LINE =
    'Add the following element into the scene, using the attached reference image for its appearance: Un banc en bois';
  const PRESERVE_LINE =
    'Keep everything else in the image exactly as it is: framing, light, materials.';

  function sourceNode(preset: string | null, kind: 'UPLOADED' | 'GENERATED' = 'GENERATED') {
    prismaMock.renderNode.findUnique.mockResolvedValue({
      id: SOURCE_NODE_ID,
      projectId: PROJECT_ID,
      blobUrl: 'https://blob.test/source-node.jpg',
      mimeType: 'image/jpeg',
      kind,
      preset,
    } as never);
  }

  function engineCall() {
    const [engine, input] = mockGenerate.mock.calls[0] as [
      string,
      Record<string, unknown> & {
        prompt: string;
        sourceImageBuffer: Buffer;
        referenceImages?: { buffer: Buffer; mimeType: string }[];
      },
    ];
    return { engine, input };
  }

  function addFields(overrides: Record<string, string> = {}) {
    return baseFields({
      editType: 'add_element',
      zone: '',
      instruction: 'Un banc en bois',
      ...overrides,
    });
  }

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () =>
        Promise.resolve(
          SOURCE_BYTES.buffer.slice(
            SOURCE_BYTES.byteOffset,
            SOURCE_BYTES.byteOffset + SOURCE_BYTES.length,
          ),
        ),
    }) as unknown as typeof fetch;
    prismaMock.material.findMany.mockResolvedValue(MATERIAL_ROWS as never);
    imageMaterials([], [correction(SOURCE_NODE_ID, 'facade_principale', 'Enduit blanc taloché')]);
  });

  describe('Ajouter without a re-applied ambiance', () => {
    it.each([
      ['an uploaded photo', null, 'UPLOADED'],
      ['a render made with no ambiance (C0)', null, 'GENERATED'],
      ['a 3D plan (a transformation, never re-applied)', 'plan_3d', 'GENERATED'],
    ] as const)(
      'on %s: the request, then the preservation sentence — no materials',
      async (_l, preset, kind) => {
        sourceNode(preset, kind);
        const res = await POST(makeReq(addFields(), pngFile()), ctx());
        expect(res.status).toBe(201);
        expect(engineCall().input.prompt).toBe([ADD_LINE, PRESERVE_LINE].join('\n'));
      },
    );

    it('sends the source node image first and the reference as the only reference image', async () => {
      sourceNode(null, 'UPLOADED');
      await POST(makeReq(addFields(), pngFile()), ctx());
      const { input } = engineCall();
      expect(global.fetch).toHaveBeenCalledWith('https://blob.test/source-node.jpg');
      expect(input.sourceImageBuffer.equals(SOURCE_BYTES)).toBe(true);
      expect(input.sourceMimeType).toBe('image/jpeg');
      expect(input.referenceImages).toHaveLength(1);
      expect(input.referenceImages?.[0]?.buffer.equals(PNG_BYTES)).toBe(true);
      expect(input.referenceImages?.[0]?.mimeType).toBe('image/png');
    });

    it('uses the engine the client chose', async () => {
      sourceNode(null, 'UPLOADED');
      await POST(makeReq(addFields({ engine: 'gpt_image' }), pngFile()), ctx());
      expect(engineCall().engine).toBe('gpt_image');
    });

    it('passes an explicit ratio and size on', async () => {
      sourceNode(null, 'UPLOADED');
      await POST(makeReq(addFields({ ratio: '4:5', resolution: '2k' }), pngFile()), ctx());
      expect(engineCall().input).toMatchObject({ aspectRatio: '4:5', resolution: '2k' });
    });

    it("sends no ratio by default ('auto') but always a size (1k by default)", async () => {
      sourceNode(null, 'UPLOADED');
      await POST(makeReq(addFields(), pngFile()), ctx());
      expect(engineCall().input).not.toHaveProperty('aspectRatio');
      expect(engineCall().input.resolution).toBe('1k');
    });
  });

  describe('Ajouter with a re-applied ambiance', () => {
    it.each([['jour_ext'], ['nuit_int'], ['esquisse']] as const)(
      'on a %s render: materials, the ambiance, then the request — and NO preservation sentence (audit F4, not fixed)',
      async (preset) => {
        sourceNode(preset);
        await POST(makeReq(addFields(), pngFile()), ctx());
        const { prompt } = engineCall().input;
        expect(prompt).toBe(
          [...MATERIAL_LINES, PRESETS[preset].promptModifier, ADD_LINE].join('\n'),
        );
        expect(prompt).not.toContain(PRESERVE_LINE);
      },
    );

    it('differs from the other path only by the materials, the ambiance and the missing preservation sentence', async () => {
      sourceNode(null, 'UPLOADED');
      await POST(makeReq(addFields(), pngFile()), ctx());
      const without = engineCall().input.prompt;
      mockGenerate.mockClear();
      sourceNode('jour_ext');
      await POST(makeReq(addFields(), pngFile()), ctx());
      const withAmbiance = engineCall().input.prompt;
      await expect(
        `--- sans ambiance réappliquée ---\n${without}\n\n--- avec ambiance réappliquée (jour_ext) ---\n${withAmbiance}\n`,
      ).toMatchFileSnapshot('./__prompts__/ajouter-deux-chemins.txt');
    });

    it('keeps the source ambiance on the new node, and sends the same images', async () => {
      sourceNode('jour_ext');
      await POST(makeReq(addFields(), pngFile()), ctx());
      expect(engineCall().input.sourceImageBuffer.equals(SOURCE_BYTES)).toBe(true);
      expect(engineCall().input.referenceImages?.[0]?.buffer.equals(PNG_BYTES)).toBe(true);
      expect(prismaMock.renderNode.create.mock.calls[0]?.[0]?.data).toMatchObject({
        preset: 'jour_ext',
        editType: 'add_element',
      });
    });
  });

  describe('Commenter', () => {
    const ANNOTATIONS = JSON.stringify([
      { x: 20, y: 40, comment: 'Façade en bardage bois' },
      { x: 70, y: 85, comment: 'Sol en pierre claire' },
    ]);

    function commentReq(fields: Record<string, string>, marked?: File): NextRequest {
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      if (marked) form.append('markedImage', marked);
      return new NextRequest(`https://test/api/projects/${PROJECT_ID}/edit`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-access-token',
          'x-csrf-token': 'csrf-tok',
          cookie: 'app-csrf=csrf-tok',
        },
        body: form,
      });
    }

    const fields = (overrides: Record<string, string> = {}) => ({
      sourceNodeId: SOURCE_NODE_ID,
      editType: 'annotate',
      variantCount: '1',
      engine: 'nanobanana',
      annotations: ANNOTATIONS,
      ...overrides,
    });

    it('with the marked copy: full prompt, source first, the marked copy as the only reference', async () => {
      sourceNode('jour_ext');
      await POST(commentReq(fields(), pngFile('marked.png')), ctx());
      const { engine, input } = engineCall();
      expect(engine).toBe('gpt_image');
      expect(input.sourceImageBuffer.equals(SOURCE_BYTES)).toBe(true);
      expect(input.referenceImages).toHaveLength(1);
      expect(input.referenceImages?.[0]?.buffer.equals(PNG_BYTES)).toBe(true);
      // Neither the materials nor the ambiance are part of a comment edit.
      expect(input.prompt).not.toContain('Materials recorded for this source image');
      expect(input.prompt).not.toContain(PRESETS.jour_ext.promptModifier);
      await expect(input.prompt).toMatchFileSnapshot('./__prompts__/commenter-avec-copie.txt');
    });

    it('without the marked copy: the points are placed by coordinates, and no reference is sent', async () => {
      sourceNode('jour_ext');
      await POST(commentReq(fields()), ctx());
      const { input } = engineCall();
      expect(input.referenceImages).toBeUndefined();
      await expect(input.prompt).toMatchFileSnapshot('./__prompts__/commenter-sans-copie.txt');
    });

    it('adds the text of the bar as an overall note, last', async () => {
      sourceNode(null, 'UPLOADED');
      await POST(
        commentReq(fields({ instruction: 'Lumière du soir' }), pngFile('marked.png')),
        ctx(),
      );
      const { prompt } = engineCall().input;
      expect(prompt.endsWith('\nOverall note: Lumière du soir')).toBe(true);
    });

    it('passes an explicit ratio and size on, and keeps the coordinates as sent', async () => {
      sourceNode(null, 'UPLOADED');
      await POST(commentReq(fields({ ratio: '1:1', resolution: '4k' })), ctx());
      const { input } = engineCall();
      expect(input).toMatchObject({ aspectRatio: '1:1', resolution: '4k' });
      expect(input.prompt).toContain(
        '1. At 20% from the left, 40% from the top (the middle-left): Façade en bardage bois',
      );
      expect(input.prompt).toContain(
        '2. At 70% from the left, 85% from the top (the bottom-right): Sol en pierre claire',
      );
    });
  });
});

// Étape 3C.3: where the ambiance is re-applied (Ajouter or a retouch on a
// render whose ambiance comes back), the prompt lists the materials of the
// SOURCE image — its detections and the user's corrections on it, resolved —
// and every variant's Generation.promptMaterials keeps exactly that list.
// Commenter and the edits that keep the photo's own light read none and send
// none ([]). The project's old sheet stays whole in materialsSnapshot only.
describe('POST /api/projects/[projectId]/edit — materials of the source image (étape 3C.3)', () => {
  const HEADER =
    "Materials recorded for this source image. Preserve each listed material by default. If the user's request explicitly changes a listed material, apply the requested change only to that material; preserve every other listed material unchanged unless the user explicitly requests otherwise:";
  const ADD_LINE =
    'Add the following element into the scene, using the attached reference image for its appearance: Un banc en bois';
  const PRESERVE_LINE =
    'Keep everything else in the image exactly as it is: framing, light, materials.';
  const OTHER_NODE_ID = 'node-other';
  const SHEET = [
    { face: 'facade_principale', valeur: 'Bardage bois', source: 'auto', confidence: 92 },
    { face: 'toiture', valeur: 'Zinc', source: 'manuel', confidence: null },
  ];

  function sourceIs(id: string, preset: string | null, kind = 'GENERATED') {
    prismaMock.renderNode.findUnique.mockResolvedValue({
      id,
      projectId: PROJECT_ID,
      blobUrl: `https://blob.test/${id}.jpg`,
      mimeType: 'image/jpeg',
      kind,
      preset,
    } as never);
  }

  const addFields = (overrides: Record<string, string> = {}) =>
    baseFields({ editType: 'add_element', zone: '', instruction: 'Un banc en bois', ...overrides });
  const prompt = (i = 0) => (mockGenerate.mock.calls[i]?.[1] as { prompt: string }).prompt;
  const stored = () =>
    prismaMock.generation.create.mock.calls.map(
      (c) =>
        c[0]?.data as unknown as {
          prompt: string;
          materialsSnapshot: unknown;
          promptMaterials: { face: string; valeur: string }[];
        },
    );

  function commentReq(overrides: Record<string, string> = {}): NextRequest {
    const form = new FormData();
    for (const [k, v] of Object.entries({
      sourceNodeId: SOURCE_NODE_ID,
      editType: 'annotate',
      variantCount: '1',
      engine: 'nanobanana',
      annotations: JSON.stringify([{ x: 50, y: 50, comment: 'Volets rouges' }]),
      ...overrides,
    }))
      form.append(k, v);
    return new NextRequest(`https://test/api/projects/${PROJECT_ID}/edit`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-access-token',
        'x-csrf-token': 'csrf-tok',
        cookie: 'app-csrf=csrf-tok',
      },
      body: form,
    });
  }

  const dbDown = () =>
    Object.assign(new Error('Can’t reach database server at db.internal:5432'), {
      code: 'P1001',
    });

  describe('isolation per image', () => {
    it('two images of one project: each edit lists its own correction, never the other’s', async () => {
      imageMaterials(
        [],
        [
          correction(SOURCE_NODE_ID, 'toiture', 'Ardoise'),
          correction(OTHER_NODE_ID, 'toiture', 'Tuile'),
        ],
      );
      sourceIs(SOURCE_NODE_ID, 'jour_ext');
      await POST(makeReq(addFields(), pngFile()), ctx());
      sourceIs(OTHER_NODE_ID, 'jour_ext');
      await POST(makeReq(addFields({ sourceNodeId: OTHER_NODE_ID }), pngFile()), ctx());

      expect(prompt(0)).toBe(
        [HEADER, '- toiture: Ardoise', PRESETS.jour_ext.promptModifier, ADD_LINE].join('\n'),
      );
      expect(prompt(1)).toBe(
        [HEADER, '- toiture: Tuile', PRESETS.jour_ext.promptModifier, ADD_LINE].join('\n'),
      );
      expect(
        prismaMock.materialCorrection.findMany.mock.calls.map(
          (c) => (c[0] as { where: unknown }).where,
        ),
      ).toEqual([{ nodeId: SOURCE_NODE_ID }, { nodeId: OTHER_NODE_ID }]);
      const [first, second] = stored();
      expect(first?.promptMaterials).toEqual([
        { face: 'toiture', valeur: 'Ardoise', origin: 'correction', nodeId: SOURCE_NODE_ID },
      ]);
      expect(second?.promptMaterials).toEqual([
        { face: 'toiture', valeur: 'Tuile', origin: 'correction', nodeId: OTHER_NODE_ID },
      ]);
    });

    it('an image with nothing of its own does not inherit the project’s old manual corrections', async () => {
      sourceIs(SOURCE_NODE_ID, 'nuit_int');
      prismaMock.material.findMany.mockResolvedValue(SHEET as never);
      imageMaterials([], [correction(OTHER_NODE_ID, 'toiture', 'Ardoise')]);
      const res = await POST(makeReq(addFields(), pngFile()), ctx());
      expect(res.status).toBe(201);
      expect(prompt()).toBe([PRESETS.nuit_int.promptModifier, ADD_LINE].join('\n'));
      expect(stored()[0]?.promptMaterials).toEqual([]);
      expect(stored()[0]?.materialsSnapshot).toEqual(SHEET);
      expect(prismaMock.material.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('priority, on an edit that re-applies the ambiance', () => {
    it('a correction replaces its detected face, a null correction removes one, the others stay', async () => {
      sourceIs(SOURCE_NODE_ID, 'esquisse');
      imageMaterials(
        [
          detection(SOURCE_NODE_ID, 'facade_principale', 'Enduit blanc', 0, 90),
          detection(SOURCE_NODE_ID, 'toiture', 'Tuile', 1, 75),
          detection(SOURCE_NODE_ID, 'sol', 'Parquet', 2, 60),
        ],
        [
          correction(SOURCE_NODE_ID, 'facade_principale', 'Bardage bois'),
          correction(SOURCE_NODE_ID, 'toiture', null),
        ],
      );
      await POST(makeReq(addFields(), pngFile()), ctx());
      expect(prompt()).toBe(
        [
          HEADER,
          '- facade_principale: Bardage bois',
          '- sol: Parquet',
          PRESETS.esquisse.promptModifier,
          ADD_LINE,
        ].join('\n'),
      );
      expect(stored()[0]?.promptMaterials).toEqual([
        {
          face: 'facade_principale',
          valeur: 'Bardage bois',
          origin: 'correction',
          nodeId: SOURCE_NODE_ID,
        },
        {
          face: 'sol',
          valeur: 'Parquet',
          origin: 'detection',
          nodeId: SOURCE_NODE_ID,
          confidence: 60,
        },
      ]);
    });

    it('a retouch on a zone uses the same list as Ajouter', async () => {
      sourceIs(SOURCE_NODE_ID, 'jour_ext');
      imageMaterials([detection(SOURCE_NODE_ID, 'sol', 'Parquet')], []);
      await POST(makeReq(baseFields()), ctx());
      expect(
        prompt().startsWith([HEADER, '- sol: Parquet', PRESETS.jour_ext.promptModifier].join('\n')),
      ).toBe(true);
      expect(stored()[0]?.promptMaterials.map((m) => m.face)).toEqual(['sol']);
    });
  });

  describe('variants', () => {
    it('every variant carries the snapshot of its own prompt — one read, one source image', async () => {
      sourceIs(SOURCE_NODE_ID, 'jour_ext');
      imageMaterials([], [correction(SOURCE_NODE_ID, 'toiture', 'Ardoise')]);
      await POST(makeReq(addFields({ variantCount: '3' }), pngFile()), ctx());
      expect(mockGenerate).toHaveBeenCalledTimes(3);
      const rows = stored();
      expect(rows).toHaveLength(3);
      rows.forEach((row, i) => {
        expect(row.prompt).toBe(prompt(i));
        expect(row.promptMaterials).toEqual([
          { face: 'toiture', valeur: 'Ardoise', origin: 'correction', nodeId: SOURCE_NODE_ID },
        ]);
      });
      expect(prismaMock.materialCorrection.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.materialDetection.findMany).toHaveBeenCalledTimes(1);
    });

    it('a partial success stores the same snapshot on each variant actually made', async () => {
      sourceIs(SOURCE_NODE_ID, 'jour_ext');
      imageMaterials([], [correction(SOURCE_NODE_ID, 'toiture', 'Ardoise')]);
      mockGenerate
        .mockResolvedValueOnce({ imageBuffer: Buffer.from('a'), mimeType: 'image/png' })
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ imageBuffer: Buffer.from('c'), mimeType: 'image/png' });
      const res = await POST(makeReq(addFields({ variantCount: '3' }), pngFile()), ctx());
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({ requestedCount: 3, createdCount: 2 });
      expect(stored()).toHaveLength(2);
      for (const row of stored()) {
        expect(row.promptMaterials).toEqual([
          { face: 'toiture', valeur: 'Ardoise', origin: 'correction', nodeId: SOURCE_NODE_ID },
        ]);
      }
      expect(mockRefundCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 50);
    });
  });

  describe('edits that do not re-apply the ambiance', () => {
    it('Commenter reads no material and sends none: [] on every variant', async () => {
      sourceIs(SOURCE_NODE_ID, 'jour_ext');
      imageMaterials([], [correction(SOURCE_NODE_ID, 'toiture', 'Ardoise')]);
      prismaMock.material.findMany.mockResolvedValue(SHEET as never);
      const res = await POST(commentReq({ variantCount: '2' }), ctx());
      expect(res.status).toBe(201);
      expect(prismaMock.materialCorrection.findMany).not.toHaveBeenCalled();
      expect(prismaMock.materialDetection.findMany).not.toHaveBeenCalled();
      for (let i = 0; i < 2; i++) {
        expect(prompt(i)).not.toContain('Materials recorded for this source image');
        expect(prompt(i)).not.toContain('Ardoise');
        expect(prompt(i)).not.toContain('Zinc');
      }
      expect(stored().map((r) => r.promptMaterials)).toEqual([[], []]);
    });

    it('Commenter still works when the materials could not be read: it never reads them', async () => {
      sourceIs(SOURCE_NODE_ID, 'jour_ext');
      prismaMock.materialCorrection.findMany.mockRejectedValue(dbDown());
      const res = await POST(commentReq(), ctx());
      expect(res.status).toBe(201);
    });

    it.each([
      ['an uploaded photo', null, 'UPLOADED'],
      ['a render made with no ambiance (C0)', null, 'GENERATED'],
      ['a 3D plan (a transformation, never re-applied)', 'plan_3d', 'GENERATED'],
    ] as const)(
      'Ajouter on %s reads no material: the request, the preservation sentence, []',
      async (_l, preset, kind) => {
        sourceIs(SOURCE_NODE_ID, preset, kind);
        imageMaterials([], [correction(SOURCE_NODE_ID, 'toiture', 'Ardoise')]);
        await POST(makeReq(addFields(), pngFile()), ctx());
        expect(prompt()).toBe([ADD_LINE, PRESERVE_LINE].join('\n'));
        expect(prismaMock.materialCorrection.findMany).not.toHaveBeenCalled();
        expect(stored()[0]?.promptMaterials).toEqual([]);
      },
    );
  });

  describe('when the materials of the image cannot be read', () => {
    it.each([
      ['its corrections', 'materialCorrection'],
      ['its detections', 'materialDetection'],
    ] as const)(
      'a failed read of %s is a 503 MATERIALS_UNAVAILABLE, before the rate limit, the quota and the engine',
      async (_label, table) => {
        sourceIs(SOURCE_NODE_ID, 'jour_ext');
        imageMaterials(
          [detection(SOURCE_NODE_ID, 'sol', 'Parquet')],
          [correction(SOURCE_NODE_ID, 'toiture', 'Ardoise')],
        );
        prismaMock[table].findMany.mockRejectedValue(dbDown());
        prismaMock.material.findMany.mockResolvedValue(SHEET as never);

        const res = await POST(makeReq(addFields({ variantCount: '2' }), pngFile()), ctx());
        expect(res.status).toBe(503);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body).toEqual({
          error: 'MATERIALS_UNAVAILABLE',
          message: 'Materials are unavailable, try again',
        });
        expect(JSON.stringify(body)).not.toContain('db.internal');
        // Nothing charged, nothing produced, no partial list, no fallback.
        expect(mockEnforceGenerationRateLimit).not.toHaveBeenCalled();
        expect(mockDebitCredits).not.toHaveBeenCalled();
        expect(mockModerateImage).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
        expect(mockGenerate).not.toHaveBeenCalled();
        expect(prismaMock.material.findMany).not.toHaveBeenCalled();
        expect(prismaMock.renderNode.create).not.toHaveBeenCalled();
        expect(prismaMock.generation.create).not.toHaveBeenCalled();
        expect(mockRefundCredits).not.toHaveBeenCalled();
      },
    );

    it('is not a timeout: no 504, no GENERATION_TIMEOUT code', async () => {
      sourceIs(SOURCE_NODE_ID, 'jour_ext');
      prismaMock.materialCorrection.findMany.mockRejectedValue(dbDown());
      const res = await POST(makeReq(addFields(), pngFile()), ctx());
      const body = (await res.json()) as Record<string, unknown>;
      expect(res.status).not.toBe(504);
      expect(body).not.toHaveProperty('code');
      expect(body.error).not.toBe('GENERATION_TIMEOUT');
    });
  });
});

// Étape 3B.4: a 504 only when every variant ran out of time.
describe('POST /api/projects/[projectId]/edit — engine deadline (étape 3B.4)', () => {
  const timeout = () => new EngineTimeoutError('nanobanana', 180_000);

  it('declares a 300 s maxDuration', () => {
    expect(maxDuration).toBe(300);
  });

  it('504s with GENERATION_TIMEOUT when every variant runs out of time, and charges nothing', async () => {
    mockGenerate.mockRejectedValue(timeout());
    const res = await POST(makeReq(baseFields({ variantCount: '2' })), ctx());
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({
      code: 'GENERATION_TIMEOUT',
      message: 'Generation timed out',
    });
    expect(mockRefundCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 100);
  });

  it('keeps 502 when the variants fail for mixed reasons (a timeout and another error)', async () => {
    mockGenerate.mockRejectedValueOnce(timeout()).mockRejectedValueOnce(new Error('boom'));
    const res = await POST(makeReq(baseFields({ variantCount: '2' })), ctx());
    expect(res.status).toBe(502);
    expect(((await res.json()) as { code: string }).code).toBe('GENERATION_FAILED');
  });

  it('keeps the partial success when one variant runs out of time and another succeeds', async () => {
    mockGenerate
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce({ imageBuffer: Buffer.from('b'), mimeType: 'image/png' });
    const res = await POST(makeReq(baseFields({ variantCount: '2' })), ctx());
    expect(res.status).toBe(201);
    const body = (await res.json()) as { createdCount: number; requestedCount: number };
    expect(body).toMatchObject({ requestedCount: 2, createdCount: 1 });
    expect(mockRefundCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 50);
  });
});
