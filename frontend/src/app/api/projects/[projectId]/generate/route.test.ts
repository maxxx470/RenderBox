// Phase 3 — payload validation (invalid preset never reaches the engine) and
// preset persistence on the created RenderNode + Generation, without ever
// touching Material rows directly (that stays detectAndMergeMaterials's job).
// Phase 4 — engine selection: invalid engine rejected, per-engine 503 when
// not configured, engine persisted on RenderNode + Generation, and the
// generation rate limit is enforced BEFORE any engine call.
// Étape 3C.3 — the prompt lists the materials of the source image only, and
// Generation.promptMaterials keeps exactly that list.
// Étape 3C.3-R2 — the daily limit runs after every precondition.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyToken: vi.fn() };
});

const { mockEnforceGenerationRateLimit } = vi.hoisted(() => ({
  mockEnforceGenerationRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-generation', () => ({
  enforceGenerationRateLimit: mockEnforceGenerationRateLimit,
}));

const { mockDebitCredits, mockRefundCredits } = vi.hoisted(() => ({
  mockDebitCredits: vi.fn(),
  mockRefundCredits: vi.fn(),
}));
vi.mock('@/lib/server/generation/tier-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/generation/tier-quota')>()),
  debitCredits: mockDebitCredits,
  refundCredits: mockRefundCredits,
}));

const { mockGenerate, mockIsEngineConfigured, mockDetectAndMerge } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
  mockIsEngineConfigured: vi.fn(),
  mockDetectAndMerge: vi.fn(),
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

vi.mock('@/lib/server/materials/detect-and-merge', () => ({
  detectAndMergeMaterials: mockDetectAndMerge,
}));

// The materials sheet (2026-10-19): its analysis is not run here — the route
// only starts it; the sheet's own tests are in materials/render-sheet.test.ts.
const { mockScheduleSheet } = vi.hoisted(() => ({ mockScheduleSheet: vi.fn() }));
vi.mock('@/lib/server/materials/render-sheet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/materials/render-sheet')>()),
  scheduleSheet: mockScheduleSheet,
}));

import { verifyToken } from '@/lib/server/auth';
import { POST, maxDuration } from './route';
import { EngineTimeoutError } from '@/lib/server/generation/engines';
import type { PresetKey } from '@/lib/server/generation/presets';
import { buildGenerationPrompt } from '@/lib/server/generation/build-prompt';
import { GEOMETRY_LOCK } from '@/lib/server/generation/render-profiles';

/**
 * What the route must send: the server's own builder on the same inputs
 * (the texts themselves are frozen in generation/build-prompt.test.ts).
 */
function sent(
  preset: PresetKey | null,
  rows: [string, string][] = [],
  customPrompt?: string,
  extra: { engine?: 'nanobanana' | 'gpt_image'; sky?: 'hazy' | 'sun' } = {},
): string {
  return buildGenerationPrompt({
    engine: extra.engine ?? 'nanobanana',
    materialsSnapshot: rows.map(([face, valeur]) => ({
      face,
      valeur,
      source: '',
      confidence: null,
    })),
    preset,
    sky: extra.sky,
    customPrompt,
  });
}

const USER_ID = 'user-1';
const PROJECT_ID = 'project-1';
const SOURCE_NODE_ID = 'node-source';

function makeReq(body: unknown): NextRequest {
  return new NextRequest(`https://test/api/projects/${PROJECT_ID}/generate`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-access-token',
      'x-csrf-token': 'csrf-tok',
      cookie: 'app-csrf=csrf-tok',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function ctx() {
  return { params: Promise.resolve({ projectId: PROJECT_ID }) };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return { sourceNodeId: SOURCE_NODE_ID, preset: 'jour_ext', engine: 'nanobanana', ...overrides };
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
  mockDebitCredits.mockReset().mockResolvedValue({ ok: true, balance: 2950 });
  mockRefundCredits.mockReset().mockResolvedValue(undefined);
  mockDetectAndMerge.mockReset().mockResolvedValue(undefined);
  mockScheduleSheet.mockReset().mockResolvedValue(undefined);
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
  } as never);
  prismaMock.material.findMany.mockResolvedValue([]);
  imageMaterials();
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  prismaMock.renderNode.create.mockResolvedValue({ id: 'node-new' } as never);
  prismaMock.generation.create.mockResolvedValue({ id: 'gen-1' } as never);
  prismaMock.renderNode.findMany.mockResolvedValue([]);

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
  }) as unknown as typeof fetch;

  mockGenerate.mockResolvedValue({
    imageBuffer: Buffer.from('img'),
    mimeType: 'image/png',
  });
});

describe('POST /api/projects/[projectId]/generate — presets', () => {
  it('400s on an invalid preset and never calls the engine', async () => {
    const res = await POST(makeReq(validBody({ preset: 'not_a_real_preset' })), ctx());
    expect(res.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(prismaMock.renderNode.create).not.toHaveBeenCalled();
  });

  it('accepts a valid preset with no customPrompt', async () => {
    const res = await POST(makeReq(validBody()), ctx());
    expect(res.status).toBe(201);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('stores the chosen preset on the created RenderNode and on Generation.preset', async () => {
    const res = await POST(
      makeReq(validBody({ preset: 'nuit_ext', customPrompt: 'vue de nuit' })),
      ctx(),
    );
    expect(res.status).toBe(201);

    expect(prismaMock.renderNode.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ preset: 'nuit_ext' }) }),
    );
    expect(prismaMock.generation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ preset: 'nuit_ext' }) }),
    );
  });

  it('never touches Material rows directly — only detectAndMergeMaterials may (Phase 2 non-regression)', async () => {
    const res = await POST(makeReq(validBody({ preset: 'esquisse' })), ctx());
    expect(res.status).toBe(201);
    expect(prismaMock.material.update).not.toHaveBeenCalled();
    expect(prismaMock.material.upsert).not.toHaveBeenCalled();
    expect(prismaMock.material.create).not.toHaveBeenCalled();
    expect(mockDetectAndMerge).toHaveBeenCalledTimes(1);
  });

  it('assembles the prompt sent to the engine with the source image materials + preset modifier', async () => {
    imageMaterials([], [correction(SOURCE_NODE_ID, 'toiture', 'Tuile terre cuite')]);

    await POST(makeReq(validBody({ preset: 'eclate' })), ctx());

    const call = mockGenerate.mock.calls[0]?.[1] as { prompt: string };
    expect(call.prompt).toContain('Tuile terre cuite');
    expect(call.prompt.toLowerCase()).toContain('exploded axonometric');
  });

  it('asks for a faithful photo render when no ambiance is chosen', async () => {
    const res = await POST(makeReq(validBody({ preset: null })), ctx());
    expect(res.status).toBe(201);
    const call = mockGenerate.mock.calls[0]?.[1] as { prompt: string };
    expect(call.prompt).toBe(sent(null));
    expect(call.prompt).toContain(GEOMETRY_LOCK);
    expect(prismaMock.renderNode.create.mock.calls[0]?.[0]?.data).toMatchObject({ preset: null });
  });

  it("builds the template's prompt on the server and records the template on the node", async () => {
    const res = await POST(
      makeReq(validBody({ preset: 'esquisse', template: 'nuit_ext', customPrompt: 'de nuit' })),
      ctx(),
    );
    expect(res.status).toBe(201);
    const call = mockGenerate.mock.calls[0]?.[1] as { prompt: string };
    expect(call.prompt.toLowerCase()).not.toContain('diagram');
    expect(call.prompt).toBe(sent('nuit_ext', [], 'de nuit'));
    expect(prismaMock.renderNode.create.mock.calls[0]?.[0]?.data).toMatchObject({
      preset: 'nuit_ext',
    });
  });
});

describe('POST /api/projects/[projectId]/generate — engines (Phase 4)', () => {
  it('400s on an invalid engine and never calls the engine dispatcher', async () => {
    const res = await POST(makeReq(validBody({ engine: 'not_a_real_engine' })), ctx());
    expect(res.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(prismaMock.renderNode.create).not.toHaveBeenCalled();
  });

  it('503s with AI_ENGINE_NOT_CONFIGURED for the requested engine specifically, without calling it', async () => {
    mockIsEngineConfigured.mockReturnValue(false);
    const res = await POST(makeReq(validBody({ engine: 'gpt_image' })), ctx());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('AI_ENGINE_NOT_CONFIGURED');
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockIsEngineConfigured).toHaveBeenCalledWith('gpt_image');
  });

  it('stores the chosen engine on the created RenderNode and on Generation.engine', async () => {
    const res = await POST(makeReq(validBody({ engine: 'gpt_image' })), ctx());
    expect(res.status).toBe(201);

    expect(prismaMock.renderNode.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ engine: 'gpt_image' }) }),
    );
    expect(prismaMock.generation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ engine: 'gpt_image' }) }),
    );
    expect(mockGenerate).toHaveBeenCalledWith('gpt_image', expect.anything());
  });

  it('429s when the daily generation rate limit is exceeded, BEFORE any engine call', async () => {
    const { NextResponse } = await import('next/server');
    mockEnforceGenerationRateLimit.mockResolvedValue(
      NextResponse.json({ error: 'GENERATION_DAILY_LIMIT_EXCEEDED' }, { status: 429 }),
    );

    const res = await POST(makeReq(validBody()), ctx());
    expect(res.status).toBe(429);
    expect(mockGenerate).not.toHaveBeenCalled();
    // Since étape 3C.3-R2 the limit comes after the preconditions: the engine
    // configuration is checked first, the engine itself never called.
    expect(mockIsEngineConfigured).toHaveBeenCalledTimes(1);
    expect(prismaMock.renderNode.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/[projectId]/generate — credits', () => {
  it('403s with NO_ACTIVE_TIER before any engine call, distinct from the hourly rate limit', async () => {
    mockDebitCredits.mockResolvedValue({ ok: false, reason: 'NO_ACTIVE_TIER', balance: null });

    const res = await POST(makeReq(validBody()), ctx());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('NO_ACTIVE_TIER');
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(prismaMock.renderNode.create).not.toHaveBeenCalled();
    // A refused debit takes no hourly unit, and there is nothing to refund.
    expect(mockEnforceGenerationRateLimit).not.toHaveBeenCalled();
    expect(mockRefundCredits).not.toHaveBeenCalled();
  });

  it('402s with INSUFFICIENT_CREDITS when the balance does not cover the render (server-side, with the cost)', async () => {
    mockDebitCredits.mockResolvedValue({ ok: false, reason: 'INSUFFICIENT_CREDITS', balance: 30 });

    const res = await POST(makeReq(validBody()), ctx());
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({
      error: 'INSUFFICIENT_CREDITS',
      cost: 4,
      balance: 30,
    });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockEnforceGenerationRateLimit).not.toHaveBeenCalled();
  });

  it('debits the grid price (Visio 2K: 6 credits) BEFORE the engine call, and keeps it once stored', async () => {
    const res = await POST(makeReq(validBody({ resolution: '2k' })), ctx());
    expect(res.status).toBe(201);
    expect(mockDebitCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 6);
    expect(mockDebitCredits.mock.invocationCallOrder[0]).toBeLessThan(
      mockGenerate.mock.invocationCallOrder[0]!,
    );
    expect(mockRefundCredits).not.toHaveBeenCalled();
    expect(((await res.json()) as { creditsBalance: number }).creditsBalance).toBe(2950);
  });

  it.each([
    ['nanobanana', '1k', 4],
    ['nanobanana', '2k', 6],
    ['nanobanana', '4k', 9],
    ['gpt_image', '1k', 6],
    ['gpt_image', '2k', 10],
    ['gpt_image', '4k', 16],
  ])('debits exactly the grid: %s at %s = %i credits', async (engine, resolution, cost) => {
    const res = await POST(makeReq(validBody({ engine, resolution })), ctx());
    expect(res.status).toBe(201);
    expect(mockDebitCredits).toHaveBeenCalledWith(prismaMock, USER_ID, cost);
  });

  it('through Kie, the price is the version the render runs on', async () => {
    vi.stubEnv('KIE_API_KEY', 'kie-test');
    try {
      await POST(makeReq(validBody({ resolution: '4k', version: 'visio-pro' })), ctx());
      // The client's version is ignored: the default (Nano Banana 2.1) runs and is priced.
      expect(mockGenerate).toHaveBeenCalledWith(
        'nanobanana',
        expect.objectContaining({ version: 'visio-2-1' }),
      );
      expect(mockDebitCredits).toHaveBeenLastCalledWith(prismaMock, USER_ID, 9);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  // 2026-10-22 (owner): no admin price any more — everyone pays the grid.
  it('an administrator pays the same grid price as everyone', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'owner@test.local',
      tokenVersion: 0,
      role: 'SUPERADMIN',
    } as never);
    await POST(makeReq(validBody({ resolution: '2k' })), ctx());
    expect(mockDebitCredits).toHaveBeenLastCalledWith(prismaMock, USER_ID, 6);
    await POST(makeReq(validBody({ engine: 'gpt_image', resolution: '4k' })), ctx());
    expect(mockDebitCredits).toHaveBeenLastCalledWith(prismaMock, USER_ID, 16);
  });

  it('prices the request itself: a cost sent by the client is ignored', async () => {
    const res = await POST(makeReq({ ...validBody({ resolution: '4k' }), cost: 1 }), ctx());
    expect(res.status).toBe(201);
    expect(mockDebitCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 9);
  });

  it('refunds the credits when the engine call fails', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('engine down'));
    const res = await POST(makeReq(validBody()), ctx());
    expect(res.status).toBe(502);
    expect(mockRefundCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 4);
  });

  it('refunds the credits when the render cannot be stored', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error('db down'));
    await expect(POST(makeReq(validBody({ resolution: '4k' })), ctx())).rejects.toThrow('db down');
    expect(mockRefundCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 9);
  });
});

// Étape 2B (non-regression): what the engine actually receives from this
// route — exact prompt, engine, source, ratio and size — and the empty
// template text, documented as it is (not fixed). The project-wide materials
// documented here before (audit F3) gave way to the source image's own in
// étape 3C.3.
describe('POST /api/projects/[projectId]/generate — what reaches the engine', () => {
  // A row of the project's old sheet, typed by the user (étape 3D sent it).
  const MATERIAL_ROWS = [
    {
      face: 'facade_principale',
      valeur: 'Enduit blanc taloché',
      source: 'manuel',
      confidence: null,
    },
  ];

  function engineInput() {
    return mockGenerate.mock.calls[0]?.[1] as Record<string, unknown> & {
      prompt: string;
      sourceImageBuffer: Buffer;
    };
  }

  it('sends C0 then the free text when no ambiance is chosen, with no materials yet', async () => {
    const res = await POST(
      makeReq(validBody({ preset: null, customPrompt: '  façade en bois  ' })),
      ctx(),
    );
    expect(res.status).toBe(201);
    expect(engineInput().prompt).toBe(sent(null, [], 'façade en bois'));
  });

  it('sends C0 when the preset field is left out entirely', async () => {
    const body = validBody();
    delete (body as Record<string, unknown>).preset;
    await POST(makeReq(body), ctx());
    expect(engineInput().prompt).toBe(sent(null));
  });

  it('sends materials, ambiance and free text in that order', async () => {
    imageMaterials([], [correction(SOURCE_NODE_ID, 'facade_principale', 'Enduit blanc taloché')]);
    await POST(makeReq(validBody({ preset: 'isometrie', customPrompt: 'vue aérienne' })), ctx());
    // The specification's isometric view keeps the recorded materials too.
    expect(engineInput().prompt).toBe(
      sent('isometrie', [['facade_principale', 'Enduit blanc taloché']], 'vue aérienne'),
    );
    mockGenerate.mockClear();
    await POST(makeReq(validBody({ preset: 'eclate', customPrompt: 'vue aérienne' })), ctx());
    expect(engineInput().prompt).toBe(
      sent('eclate', [['facade_principale', 'Enduit blanc taloché']], 'vue aérienne'),
    );
  });

  it('passes the chosen engine to the dispatcher', async () => {
    await POST(makeReq(validBody({ engine: 'gpt_image' })), ctx());
    expect(mockGenerate.mock.calls[0]?.[0]).toBe('gpt_image');
  });

  it('passes an explicit ratio and size on', async () => {
    await POST(makeReq(validBody({ ratio: '16:9', resolution: '4k' })), ctx());
    expect(engineInput()).toMatchObject({ aspectRatio: '16:9', resolution: '4k' });
  });

  it("sends no ratio for 'auto' and no size when none is given", async () => {
    await POST(makeReq(validBody({ ratio: 'auto' })), ctx());
    expect(engineInput()).not.toHaveProperty('aspectRatio');
    expect(engineInput()).not.toHaveProperty('resolution');
  });

  it("reads the selected node's own image and hands its bytes and MIME type to the engine", async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({
      id: SOURCE_NODE_ID,
      projectId: PROJECT_ID,
      blobUrl: 'https://blob.test/selected-node.jpg',
      mimeType: 'image/jpeg',
    } as never);
    const bytes = Buffer.from('selected-node-bytes');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () =>
        Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)),
    }) as unknown as typeof fetch;

    await POST(makeReq(validBody()), ctx());

    expect(global.fetch).toHaveBeenCalledWith('https://blob.test/selected-node.jpg');
    expect(engineInput().sourceImageBuffer.equals(bytes)).toBe(true);
    expect(engineInput().sourceMimeType).toBe('image/jpeg');
  });

  it('sends no reference image on a generation', async () => {
    await POST(makeReq(validBody()), ctx());
    expect(engineInput()).not.toHaveProperty('referenceImages');
  });

  it("a template's prompt comes from the server; the bar's text is only the user's request (D1)", async () => {
    await POST(
      makeReq(validBody({ preset: 'plan_3d', template: 'jour_int', customPrompt: 'plus chaud' })),
      ctx(),
    );
    expect(engineInput().prompt).toBe(sent('jour_int', [], 'plus chaud'));
    expect(engineInput().prompt).not.toContain('top-down');
  });

  it('a template with no note still sends its whole profile (audit F7, fixed)', async () => {
    const res = await POST(
      makeReq(validBody({ preset: null, template: 'nuit_ext', customPrompt: '' })),
      ctx(),
    );
    expect(res.status).toBe(201);
    expect(engineInput().prompt).toBe(sent('nuit_ext'));
    expect(engineInput().prompt).toContain('Blue-hour dusk deepening to night');
  });

  it("exterior day's sky: lightly hazy by default, direct sun when asked (D2)", async () => {
    await POST(makeReq(validBody({ template: 'jour_ext' })), ctx());
    expect(engineInput().prompt).toBe(sent('jour_ext'));
    mockGenerate.mockClear();
    await POST(makeReq(validBody({ template: 'jour_ext', sky: 'sun' })), ctx());
    expect(engineInput().prompt).toBe(sent('jour_ext', [], undefined, { sky: 'sun' }));
    expect(engineInput().prompt).toContain('Clear blue sky with a few well-defined white clouds');
  });

  it('refuses an unknown sky', async () => {
    const res = await POST(makeReq(validBody({ template: 'jour_ext', sky: 'pink' })), ctx());
    expect(res.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('lays the prompt out for the chosen engine', async () => {
    await POST(makeReq(validBody({ engine: 'gpt_image', preset: null })), ctx());
    expect(engineInput().prompt).toBe(sent(null, [], undefined, { engine: 'gpt_image' }));
    expect(engineInput().prompt).toContain('6. FINAL CHECK');
  });

  it('scopes the materials to the source image: the project sheet is read for the snapshot only (audit F3, étape 3C.3)', async () => {
    prismaMock.material.findMany.mockResolvedValue(MATERIAL_ROWS as never);
    await POST(makeReq(validBody({ preset: null })), ctx());
    expect(prismaMock.material.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: PROJECT_ID } }),
    );
    expect(prismaMock.materialCorrection.findMany.mock.calls[0]?.[0]?.where).toEqual({
      nodeId: SOURCE_NODE_ID,
    });
    expect(prismaMock.materialDetection.findMany.mock.calls[0]?.[0]?.where).toEqual({
      nodeId: SOURCE_NODE_ID,
    });
    expect(engineInput().prompt).toBe(sent(null));

    imageMaterials([], [correction(SOURCE_NODE_ID, 'facade_principale', 'Enduit blanc taloché')]);
    mockGenerate.mockClear();
    await POST(makeReq(validBody({ preset: null })), ctx());
    expect(engineInput().prompt).toBe(sent(null, [['facade_principale', 'Enduit blanc taloché']]));
  });

  it('re-reads the materials from the GENERATED image, not from the source', async () => {
    mockGenerate.mockResolvedValue({
      imageBuffer: Buffer.from('result-bytes'),
      mimeType: 'image/jpeg',
    });
    await POST(makeReq(validBody()), ctx());
    expect(mockDetectAndMerge).toHaveBeenCalledTimes(1);
    const [projectId, buffer, mimeType] = mockDetectAndMerge.mock.calls[0] as [
      string,
      Buffer,
      string,
    ];
    expect(projectId).toBe(PROJECT_ID);
    expect(buffer.equals(Buffer.from('result-bytes'))).toBe(true);
    expect(mimeType).toBe('image/jpeg');
  });

  it('503s with STORAGE_NOT_CONFIGURED before any engine call when the storage token is missing', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const res = await POST(makeReq(validBody()), ctx());
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe('STORAGE_NOT_CONFIGURED');
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

// Étape 3C.3: the prompt lists the materials of the SOURCE image — its
// detections and the user's corrections on it, resolved (resolve.ts) — and
// Generation.promptMaterials keeps exactly that list. The project's old sheet
// (étape 3D sent its manual rows) stays whole in materialsSnapshot only: an
// old project correction counts again only once attached to an image.
describe('POST /api/projects/[projectId]/generate — materials of the source image (étape 3C.3)', () => {
  const OTHER_NODE_ID = 'node-other';
  const SHEET = [
    { face: 'toiture', valeur: 'Zinc', source: 'manuel', confidence: null },
    { face: 'sol', valeur: 'Béton ciré', source: 'auto', confidence: 70 },
  ];

  const prompt = (i = 0) => (mockGenerate.mock.calls[i]?.[1] as { prompt: string }).prompt;
  const stored = (i = 0) =>
    prismaMock.generation.create.mock.calls[i]?.[0]?.data as unknown as {
      prompt: string;
      materialsSnapshot: unknown;
      promptMaterials: { face: string; valeur: string }[];
    };

  function sourceIs(id: string) {
    prismaMock.renderNode.findUnique.mockResolvedValue({
      id,
      projectId: PROJECT_ID,
      blobUrl: `https://blob.test/${id}.png`,
      mimeType: 'image/png',
    } as never);
  }

  describe('isolation per image', () => {
    it('two images of one project: each generation lists its own correction, never the other’s', async () => {
      imageMaterials(
        [],
        [
          correction(SOURCE_NODE_ID, 'facade_principale', 'Bardage bois'),
          correction(OTHER_NODE_ID, 'facade_principale', 'Enduit blanc'),
        ],
      );
      await POST(makeReq(validBody({ preset: null })), ctx());
      sourceIs(OTHER_NODE_ID);
      await POST(makeReq(validBody({ preset: null, sourceNodeId: OTHER_NODE_ID })), ctx());

      expect(prompt(0)).toBe(sent(null, [['facade_principale', 'Bardage bois']]));
      expect(prompt(1)).toBe(sent(null, [['facade_principale', 'Enduit blanc']]));
      const asked = (calls: readonly (readonly unknown[])[]) =>
        calls.map((c) => (c[0] as { where: unknown }).where);
      expect(asked(prismaMock.materialCorrection.findMany.mock.calls)).toEqual([
        { nodeId: SOURCE_NODE_ID },
        { nodeId: OTHER_NODE_ID },
      ]);
      expect(asked(prismaMock.materialDetection.findMany.mock.calls)).toEqual([
        { nodeId: SOURCE_NODE_ID },
        { nodeId: OTHER_NODE_ID },
      ]);
      expect(stored(0).promptMaterials).toEqual([
        {
          face: 'facade_principale',
          valeur: 'Bardage bois',
          origin: 'correction',
          nodeId: SOURCE_NODE_ID,
        },
      ]);
      expect(stored(1).promptMaterials).toEqual([
        {
          face: 'facade_principale',
          valeur: 'Enduit blanc',
          origin: 'correction',
          nodeId: OTHER_NODE_ID,
        },
      ]);
    });

    it('an image with nothing of its own does not inherit the project’s old manual corrections', async () => {
      prismaMock.material.findMany.mockResolvedValue(SHEET as never);
      imageMaterials([], [correction(OTHER_NODE_ID, 'toiture', 'Ardoise')]);
      const res = await POST(
        makeReq(validBody({ preset: null, customPrompt: 'vue de face' })),
        ctx(),
      );
      expect(res.status).toBe(201);
      expect(prompt()).toBe(sent(null, [], 'vue de face'));
      expect(prompt()).not.toContain('Zinc');
      expect(prompt()).not.toContain('Ardoise');
      expect(stored().promptMaterials).toEqual([]);
      // The old sheet is still kept whole in its own column.
      expect(stored().materialsSnapshot).toEqual(SHEET);
    });
  });

  describe('priority', () => {
    const DETECTED = [
      detection(SOURCE_NODE_ID, 'facade_principale', 'Enduit blanc', 0, 90),
      detection(SOURCE_NODE_ID, 'toiture', 'Tuile', 1, 75),
      detection(SOURCE_NODE_ID, 'sol', 'Parquet', 2, 60),
    ];

    it('a correction replaces the detection of its face; the other faces stay', async () => {
      imageMaterials(DETECTED, [correction(SOURCE_NODE_ID, 'toiture', 'Ardoise')]);
      await POST(makeReq(validBody({ preset: null })), ctx());
      expect(prompt()).toBe(
        sent(null, [
          ['facade_principale', 'Enduit blanc'],
          ['toiture', 'Ardoise'],
          ['sol', 'Parquet'],
        ]),
      );
      expect(stored().promptMaterials).toEqual([
        {
          face: 'facade_principale',
          valeur: 'Enduit blanc',
          origin: 'detection',
          nodeId: SOURCE_NODE_ID,
          confidence: 90,
        },
        { face: 'toiture', valeur: 'Ardoise', origin: 'correction', nodeId: SOURCE_NODE_ID },
        {
          face: 'sol',
          valeur: 'Parquet',
          origin: 'detection',
          nodeId: SOURCE_NODE_ID,
          confidence: 60,
        },
      ]);
    });

    it('a correction with valeur null removes a detected face; the other faces stay', async () => {
      imageMaterials(DETECTED, [correction(SOURCE_NODE_ID, 'toiture', null)]);
      await POST(makeReq(validBody({ preset: null })), ctx());
      expect(prompt()).toBe(
        sent(null, [
          ['facade_principale', 'Enduit blanc'],
          ['sol', 'Parquet'],
        ]),
      );
      expect(prompt()).not.toContain('Tuile');
      expect(stored().promptMaterials.map((m) => m.face)).toEqual(['facade_principale', 'sol']);
    });

    it('once the correction is cancelled, the detection is listed again', async () => {
      imageMaterials(DETECTED, [correction(SOURCE_NODE_ID, 'toiture', null)]);
      await POST(makeReq(validBody({ preset: null })), ctx());
      imageMaterials(DETECTED, []);
      await POST(makeReq(validBody({ preset: null })), ctx());
      expect(prompt(0)).not.toContain('toiture');
      expect(prompt(1)).toContain('- toiture: Tuile');
      expect(stored(1).promptMaterials.map((m) => m.face)).toEqual([
        'facade_principale',
        'toiture',
        'sol',
      ]);
    });
  });

  describe('prompt and snapshot', () => {
    it('Generation.promptMaterials is the list the prompt was built from, and Generation.prompt what the engine got', async () => {
      imageMaterials(
        [detection(SOURCE_NODE_ID, 'sol', 'Béton ciré', 0, 70)],
        [correction(SOURCE_NODE_ID, 'menuiseries', 'Aluminium noir')],
      );
      await POST(makeReq(validBody({ preset: 'eclate', customPrompt: 'vue aérienne' })), ctx());
      const data = stored();
      expect(data.prompt).toBe(prompt());
      expect(prompt()).toBe(
        sent(
          'eclate',
          data.promptMaterials.map((m) => [m.face, m.valeur]),
          'vue aérienne',
        ),
      );
      expect(data.promptMaterials.map((m) => m.face)).toEqual(['sol', 'menuiseries']);
    });

    it('no material at all: no header in the prompt, [] in promptMaterials — never null, never invented', async () => {
      const res = await POST(makeReq(validBody({ preset: null })), ctx());
      expect(res.status).toBe(201);
      expect(prompt()).toBe(sent(null));
      expect(stored().promptMaterials).toEqual([]);
    });

    it('the same list goes with a template of the fan', async () => {
      imageMaterials([], [correction(SOURCE_NODE_ID, 'toiture', 'Zinc')]);
      await POST(makeReq(validBody({ preset: null, template: 'nuit_ext' })), ctx());
      expect(prompt()).toBe(sent('nuit_ext', [['toiture', 'Zinc']]));
      expect(stored().promptMaterials).toEqual([
        { face: 'toiture', valeur: 'Zinc', origin: 'correction', nodeId: SOURCE_NODE_ID },
      ]);
    });

    it('still re-reads the materials from the generated image afterwards (old detector, until 3C.6)', async () => {
      await POST(makeReq(validBody()), ctx());
      expect(mockDetectAndMerge).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the materials of the image cannot be read', () => {
    const dbDown = () =>
      Object.assign(new Error('Can’t reach database server at db.internal:5432'), {
        code: 'P1001',
      });

    it.each([
      ['its corrections', 'materialCorrection'],
      ['its detections', 'materialDetection'],
    ] as const)(
      'a failed read of %s is a 503 MATERIALS_UNAVAILABLE: no engine call, nothing stored, no usage recorded',
      async (_label, table) => {
        imageMaterials(
          [detection(SOURCE_NODE_ID, 'sol', 'Parquet')],
          [correction(SOURCE_NODE_ID, 'toiture', 'Ardoise')],
        );
        prismaMock[table].findMany.mockRejectedValue(dbDown());
        prismaMock.material.findMany.mockResolvedValue(SHEET as never);

        const res = await POST(makeReq(validBody()), ctx());
        expect(res.status).toBe(503);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body).toEqual({
          error: 'MATERIALS_UNAVAILABLE',
          message: 'Materials are unavailable, try again',
        });
        expect(JSON.stringify(body)).not.toContain('db.internal');
        expect(res.headers.get('x-request-id')).toBeTruthy();
        // Nothing past the read: no partial list, no fallback on the old sheet.
        expect(mockGenerate).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
        expect(prismaMock.material.findMany).not.toHaveBeenCalled();
        expect(prismaMock.renderNode.create).not.toHaveBeenCalled();
        expect(prismaMock.generation.create).not.toHaveBeenCalled();
        expect(mockDebitCredits).not.toHaveBeenCalled();
        expect(mockDetectAndMerge).not.toHaveBeenCalled();
      },
    );

    it('is not a timeout: no 504, no GENERATION_TIMEOUT code', async () => {
      prismaMock.materialCorrection.findMany.mockRejectedValue(dbDown());
      const res = await POST(makeReq(validBody()), ctx());
      const body = (await res.json()) as Record<string, unknown>;
      expect(res.status).not.toBe(504);
      expect(body).not.toHaveProperty('code');
      expect(body.error).not.toBe('GENERATION_TIMEOUT');
    });

    it('takes no hourly unit and debits no credits', async () => {
      prismaMock.materialCorrection.findMany.mockRejectedValue(dbDown());
      await POST(makeReq(validBody()), ctx());
      // Étape 3C.3-R2: the limit and the credits come after every
      // precondition, the materials included.
      expect(mockEnforceGenerationRateLimit).not.toHaveBeenCalled();
      expect(mockDebitCredits).not.toHaveBeenCalled();
      expect(mockRefundCredits).not.toHaveBeenCalled();
    });
  });
});

// Étape 3C.3-R2: the daily limit (one immediate INCR per call, rolled back by
// the limiter itself on a 429) runs once every precondition holds — after
// session, project, monthly quota, body, source node, services and the
// materials of the source image. A request that cannot start takes no unit;
// one that gets past it keeps its unit, even if the engine then fails. The
// limiter is mocked here; route.daily-limit.test.ts runs the real one on a
// fake Redis.
describe('POST /api/projects/[projectId]/generate — daily limit after the preconditions (étape 3C.3-R2)', () => {
  const at429 = async () => {
    const { NextResponse } = await import('next/server');
    return NextResponse.json(
      {
        error: 'GENERATION_DAILY_LIMIT_EXCEEDED',
        message: 'Daily generation limit reached. Try again tomorrow.',
      },
      { status: 429 },
    );
  };
  const dbDown = () => Object.assign(new Error('db down'), { code: 'P1001' });

  const EARLY: [string, () => void, Record<string, unknown>, number, Record<string, unknown>][] = [
    [
      'an invalid body',
      () => {},
      { engine: 'not_a_real_engine' },
      400,
      { error: 'VALIDATION_FAILED' },
    ],
    [
      'an unknown source node',
      () => prismaMock.renderNode.findUnique.mockResolvedValue(null as never),
      {},
      404,
      {
        error: 'SOURCE_NODE_NOT_FOUND',
        message: 'Source render node not found in this project',
      },
    ],
    [
      'an engine not configured',
      () => mockIsEngineConfigured.mockReturnValue(false),
      {},
      503,
      { code: 'AI_ENGINE_NOT_CONFIGURED', message: 'AI generation is not configured' },
    ],
    [
      'storage not configured',
      () => delete process.env.BLOB_READ_WRITE_TOKEN,
      {},
      503,
      { code: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
    ],
    [
      'unreadable materials',
      () => prismaMock.materialCorrection.findMany.mockRejectedValue(dbDown()),
      {},
      503,
      { error: 'MATERIALS_UNAVAILABLE', message: 'Materials are unavailable, try again' },
    ],
    [
      'no active tier',
      () =>
        mockDebitCredits.mockResolvedValue({ ok: false, reason: 'NO_ACTIVE_TIER', balance: null }),
      {},
      403,
      { error: 'NO_ACTIVE_TIER', message: 'No active plan' },
    ],
    [
      'not enough credits',
      () =>
        mockDebitCredits.mockResolvedValue({
          ok: false,
          reason: 'INSUFFICIENT_CREDITS',
          balance: 0,
        }),
      {},
      402,
      { error: 'INSUFFICIENT_CREDITS', message: 'Not enough credits for this request' },
    ],
  ];

  it.each(EARLY)(
    '%s: same answer as before, before the daily limit, no engine call',
    async (_label, arrange, overrides, status, body) => {
      arrange();
      const res = await POST(makeReq(validBody(overrides)), ctx());
      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject(body);
      expect(mockEnforceGenerationRateLimit).not.toHaveBeenCalled();
      expect(mockGenerate).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockRefundCredits).not.toHaveBeenCalled();
    },
  );

  it.each(EARLY)(
    'a user already at the daily limit with %s gets that answer, not the 429',
    async (_label, arrange, overrides, status) => {
      mockEnforceGenerationRateLimit.mockImplementation(at429);
      arrange();
      const res = await POST(makeReq(validBody(overrides)), ctx());
      expect(res.status).toBe(status);
      expect(mockEnforceGenerationRateLimit).not.toHaveBeenCalled();
    },
  );

  it('session, CSRF and project ownership still come first: no daily unit either', async () => {
    vi.mocked(verifyToken).mockResolvedValue(null as never);
    expect((await POST(makeReq(validBody()), ctx())).status).toBe(401);
    prismaMock.project.findUnique.mockResolvedValue({ userId: 'someone-else' } as never);
    vi.mocked(verifyToken).mockResolvedValue({
      sub: USER_ID,
      email: 'owner@test.local',
      tokenVersion: 0,
    });
    expect((await POST(makeReq(validBody()), ctx())).status).toBe(404);
    const noCsrf = new NextRequest(`https://test/api/projects/${PROJECT_ID}/generate`, {
      method: 'POST',
      headers: { authorization: 'Bearer valid-access-token', 'content-type': 'application/json' },
      body: JSON.stringify(validBody()),
    });
    expect((await POST(noCsrf, ctx())).status).toBe(403);
    expect(mockDebitCredits).not.toHaveBeenCalled();
    expect(mockEnforceGenerationRateLimit).not.toHaveBeenCalled();
  });

  it('a valid request: one call, after the materials are read, before the image is fetched and the engine called', async () => {
    const res = await POST(makeReq(validBody()), ctx());
    expect(res.status).toBe(201);
    expect(mockEnforceGenerationRateLimit).toHaveBeenCalledTimes(1);
    expect(mockEnforceGenerationRateLimit).toHaveBeenCalledWith(USER_ID);
    const limit = mockEnforceGenerationRateLimit.mock.invocationCallOrder[0]!;
    expect(prismaMock.materialCorrection.findMany.mock.invocationCallOrder[0]!).toBeLessThan(limit);
    expect(prismaMock.materialDetection.findMany.mock.invocationCallOrder[0]!).toBeLessThan(limit);
    expect(mockDebitCredits.mock.invocationCallOrder[0]!).toBeLessThan(limit);
    expect(mockIsEngineConfigured.mock.invocationCallOrder[0]!).toBeLessThan(limit);
    expect(vi.mocked(global.fetch).mock.invocationCallOrder[0]!).toBeGreaterThan(limit);
    expect(mockGenerate.mock.invocationCallOrder[0]!).toBeGreaterThan(limit);
    expect(mockRefundCredits).not.toHaveBeenCalled();
  });

  it.each([
    ['an engine failure (502)', () => mockGenerate.mockRejectedValueOnce(new Error('down')), 502],
    [
      'an engine timeout (504)',
      () => mockGenerate.mockRejectedValueOnce(new EngineTimeoutError('nanobanana', 180_000)),
      504,
    ],
    [
      'an unreadable source image (502)',
      () => vi.mocked(global.fetch).mockResolvedValueOnce({ ok: false } as Response),
      502,
    ],
  ])(
    'past the hourly limit, %s keeps the unit (one call) but refunds the credits',
    async (_label, arrange, status) => {
      arrange();
      const res = await POST(makeReq(validBody()), ctx());
      expect(res.status).toBe(status);
      expect(mockEnforceGenerationRateLimit).toHaveBeenCalledTimes(1);
      expect(mockRefundCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 4);
    },
  );

  it('the 429 is passed on as the limiter answers it, after the preconditions, with no engine call', async () => {
    mockEnforceGenerationRateLimit.mockImplementation(at429);
    const res = await POST(makeReq(validBody()), ctx());
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: 'GENERATION_DAILY_LIMIT_EXCEEDED',
      message: 'Daily generation limit reached. Try again tomorrow.',
    });
    expect(mockEnforceGenerationRateLimit).toHaveBeenCalledTimes(1);
    expect(prismaMock.materialCorrection.findMany).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(prismaMock.renderNode.create).not.toHaveBeenCalled();
    // The credits were debited just before the limiter: they come back.
    expect(mockRefundCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 4);
  });

  it('two valid requests at once: each calls the limiter once, for its own user unit (mocked, not real Redis)', async () => {
    let units = 0;
    mockEnforceGenerationRateLimit.mockImplementation(async () => {
      units += 1;
      return null;
    });
    const [a, b] = await Promise.all([
      POST(makeReq(validBody()), ctx()),
      POST(makeReq(validBody({ preset: null })), ctx()),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(mockEnforceGenerationRateLimit).toHaveBeenCalledTimes(2);
    expect(units).toBe(2);
  });
});

// Étape 3B.4: an engine that ran out of time is a 504 GENERATION_TIMEOUT;
// every other failure keeps its answer.
describe('POST /api/projects/[projectId]/generate — engine deadline (étape 3B.4)', () => {
  it('declares a 300 s maxDuration', () => {
    expect(maxDuration).toBe(300);
  });

  it('504s with GENERATION_TIMEOUT when the engine runs out of time, and stores nor charges anything', async () => {
    mockGenerate.mockRejectedValueOnce(new EngineTimeoutError('nanobanana', 180_000));
    const res = await POST(makeReq(validBody()), ctx());
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({
      code: 'GENERATION_TIMEOUT',
      message: 'Generation timed out',
    });
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(prismaMock.renderNode.create).not.toHaveBeenCalled();
    expect(mockRefundCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 4);
    expect(mockDetectAndMerge).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an SDK timeout that is not the engine deadline',
      Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }),
    ],
    ['an abort error', new DOMException('This operation was aborted', 'AbortError')],
  ])('keeps 502 GENERATION_FAILED for %s', async (_label, err) => {
    mockGenerate.mockRejectedValueOnce(err);
    const res = await POST(makeReq(validBody()), ctx());
    expect(res.status).toBe(502);
    expect(((await res.json()) as { code: string }).code).toBe('GENERATION_FAILED');
  });

  it('a material detection that runs out of time does not fail the generation', async () => {
    mockDetectAndMerge.mockRejectedValueOnce(
      Object.assign(new Error('Claude Vision did not answer within 30 s'), {
        name: 'VisionTimeoutError',
      }),
    );
    const res = await POST(makeReq(validBody()), ctx());
    expect(res.status).toBe(201);
    expect(((await res.json()) as { materialsDetected: boolean }).materialsDetected).toBe(false);
    expect(mockRefundCredits).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/[projectId]/generate — the materials sheet (2026-10-19)', () => {
  const PASTED = [
    'FICHE RENDERPRO · RP-7K4M2Q',
    'Image source : RP-3D9F1A',
    'Ambiance : Nuit extérieur [nuit_ext]',
    'Couleur → matériau :',
    '- Brun-rouge des murs → brique rouge, joints creux',
    '- Gris foncé du garde-corps → métal noir mat',
    'FIN DE LA FICHE',
  ].join('\n');
  const engineInput = () => mockGenerate.mock.calls[0]?.[1] as { prompt: string };
  const LINES = [
    { color: 'Brun-rouge des murs', material: 'brique rouge, joints creux' },
    { color: 'Gris foncé du garde-corps', material: 'métal noir mat' },
  ];

  it('starts the sheet of the render once it is stored, with its ambiance and its source', async () => {
    await POST(makeReq(validBody({ preset: 'jour_ext', sky: 'sun' })), ctx());
    expect(mockScheduleSheet).toHaveBeenCalledTimes(1);
    expect(mockScheduleSheet).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'node-new',
        sourceNodeId: SOURCE_NODE_ID,
        ambiance: { key: 'jour_ext', sky: 'sun' },
      }),
    );
  });

  it('a sheet that cannot start never fails the render', async () => {
    mockScheduleSheet.mockRejectedValue(new Error('db down'));
    const res = await POST(makeReq(validBody()), ctx());
    expect(res.status).toBe(201);
  });

  it('a sheet pasted under the prompt goes to the engine as a request, and its ambiance is used', async () => {
    const res = await POST(
      makeReq(validBody({ preset: null, customPrompt: `une précision\n\n${PASTED}` })),
      ctx(),
    );
    expect(res.status).toBe(201);
    const expected = buildGenerationPrompt({
      engine: 'nanobanana',
      materialsSnapshot: [],
      preset: 'nuit_ext',
      customPrompt: 'une précision',
      sheet: { code: 'RP-7K4M2Q', lines: LINES },
    });
    expect(engineInput().prompt).toBe(expected);
    expect(engineInput().prompt).toContain(
      'where the image shows Brun-rouge des murs: brique rouge, joints creux',
    );
    expect(prismaMock.renderNode.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ preset: 'nuit_ext' }) }),
    );
  });

  it('an ambiance the user chose wins over the one in the sheet', async () => {
    await POST(makeReq(validBody({ preset: 'pluie', customPrompt: PASTED })), ctx());
    expect(prismaMock.renderNode.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ preset: 'pluie' }) }),
    );
  });

  it('the sheet is taken out of the ambiance text too, so an unchanged text stays the default', async () => {
    const { ambianceText } = await import('@/lib/server/generation/ambiance-text');
    await POST(
      makeReq(
        validBody({ preset: 'nuit_ext', ambianceText: `${ambianceText('nuit_ext')}\n\n${PASTED}` }),
      ),
      ctx(),
    );
    expect(engineInput().prompt).toBe(
      buildGenerationPrompt({
        engine: 'nanobanana',
        materialsSnapshot: [],
        preset: 'nuit_ext',
        sheet: { code: 'RP-7K4M2Q', lines: LINES },
      }),
    );
  });
});
