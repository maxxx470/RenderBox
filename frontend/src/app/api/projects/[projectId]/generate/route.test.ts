// Phase 3 — payload validation (invalid preset never reaches the engine) and
// preset persistence on the created RenderNode + Generation, without ever
// touching Material rows directly (that stays detectAndMergeMaterials's job).
// Phase 4 — engine selection: invalid engine rejected, per-engine 503 when
// not configured, engine persisted on RenderNode + Generation, and the
// generation rate limit is enforced BEFORE any engine call.
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

import { verifyToken } from '@/lib/server/auth';
import { POST } from './route';

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

beforeEach(() => {
  __cookieStore.clear();
  vi.mocked(verifyToken).mockReset();
  mockGenerate.mockReset();
  mockIsEngineConfigured.mockReset().mockReturnValue(true);
  mockEnforceGenerationRateLimit.mockReset().mockResolvedValue(null);
  mockDetectAndMerge.mockReset().mockResolvedValue(undefined);
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

  it('assembles the prompt sent to the engine with the materials sheet + preset modifier', async () => {
    prismaMock.material.findMany.mockResolvedValue([
      { face: 'toiture', valeur: 'Tuile terre cuite', source: 'manuel', confidence: null },
    ] as never);

    await POST(makeReq(validBody({ preset: 'esquisse' })), ctx());

    const call = mockGenerate.mock.calls[0]?.[1] as { prompt: string };
    expect(call.prompt).toContain('Tuile terre cuite');
    expect(call.prompt.toLowerCase()).toContain('sketch');
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
    expect(mockIsEngineConfigured).not.toHaveBeenCalled();
    expect(prismaMock.renderNode.create).not.toHaveBeenCalled();
  });
});
