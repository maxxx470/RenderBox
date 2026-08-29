// Phase 5 — payload validation (add_element needs a reference image,
// targeted_retouch needs a zone, variantCount is 1-4), source-node-must-be-
// GENERATED guard, multi-variant creation (N RenderNodes, N-unit rate-limit
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
  mockCheckTierQuota,
  mockRecordTierUsage,
} = vi.hoisted(() => ({
  mockEnforceGenerationRateLimit: vi.fn(),
  mockGenerate: vi.fn(),
  mockIsEngineConfigured: vi.fn(),
  mockModerateImage: vi.fn(),
  mockCheckTierQuota: vi.fn(),
  mockRecordTierUsage: vi.fn(),
}));

vi.mock('@/lib/server/middleware/rate-limit-generation', () => ({
  enforceGenerationRateLimit: mockEnforceGenerationRateLimit,
}));

vi.mock('@/lib/server/generation/tier-quota', () => ({
  checkTierQuota: mockCheckTierQuota,
  recordTierUsage: mockRecordTierUsage,
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
import { POST } from './route';

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

beforeEach(() => {
  __cookieStore.clear();
  vi.mocked(verifyToken).mockReset();
  mockGenerate.mockReset();
  mockIsEngineConfigured.mockReset().mockReturnValue(true);
  mockEnforceGenerationRateLimit.mockReset().mockResolvedValue(null);
  mockCheckTierQuota
    .mockReset()
    .mockResolvedValue({ allowed: true, tier: 'standard', max: 100, remaining: 99 });
  mockRecordTierUsage.mockReset().mockResolvedValue(undefined);
  mockModerateImage.mockReset().mockResolvedValue({ flagged: false, categories: [] });
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

  it('400s when the source node is an UPLOADED node, not GENERATED', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({
      id: SOURCE_NODE_ID,
      projectId: PROJECT_ID,
      blobUrl: 'https://blob.test/source.png',
      mimeType: 'image/png',
      kind: 'UPLOADED',
      preset: null,
    } as never);
    const res = await POST(makeReq(baseFields()), ctx());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('SOURCE_NOT_EDITABLE');
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/[projectId]/edit — multi-variant', () => {
  it('creates N RenderNodes with the same parentId, charges the rate limit N units, and records N units of tier usage', async () => {
    const res = await POST(makeReq(baseFields({ variantCount: '3' })), ctx());
    expect(res.status).toBe(201);
    const body = (await res.json()) as { createdCount: number; requestedCount: number };
    expect(body.requestedCount).toBe(3);
    expect(body.createdCount).toBe(3);
    expect(mockGenerate).toHaveBeenCalledTimes(3);
    expect(mockEnforceGenerationRateLimit).toHaveBeenCalledWith(USER_ID, 3);
    expect(mockCheckTierQuota).toHaveBeenCalledWith(prismaMock, USER_ID, 3);
    expect(mockRecordTierUsage).toHaveBeenCalledWith(prismaMock, USER_ID, 3);
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
  });

  it('reports partial success when some variants fail to generate, and records tier usage for the 2 that actually succeeded, not the 3 requested', async () => {
    mockGenerate
      .mockResolvedValueOnce({ imageBuffer: Buffer.from('a'), mimeType: 'image/png' })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ imageBuffer: Buffer.from('c'), mimeType: 'image/png' });

    const res = await POST(makeReq(baseFields({ variantCount: '3' })), ctx());
    expect(res.status).toBe(201);
    const body = (await res.json()) as { createdCount: number; requestedCount: number };
    expect(body.requestedCount).toBe(3);
    expect(body.createdCount).toBe(2);
    expect(mockRecordTierUsage).toHaveBeenCalledWith(prismaMock, USER_ID, 2);
  });

  it('502s when every variant fails to generate, and never records any tier usage', async () => {
    mockGenerate.mockRejectedValue(new Error('boom'));
    const res = await POST(makeReq(baseFields({ variantCount: '2' })), ctx());
    expect(res.status).toBe(502);
    expect(mockRecordTierUsage).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/[projectId]/edit — monthly tier quota', () => {
  it('403s with NO_ACTIVE_TIER before any engine call', async () => {
    mockCheckTierQuota.mockResolvedValue({
      allowed: false,
      reason: 'NO_ACTIVE_TIER',
      tier: null,
      max: null,
      remaining: null,
    });
    const res = await POST(makeReq(baseFields()), ctx());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('NO_ACTIVE_TIER');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('402s with QUOTA_EXCEEDED when the batch would overshoot the remaining quota', async () => {
    mockCheckTierQuota.mockResolvedValue({
      allowed: false,
      reason: 'QUOTA_EXCEEDED',
      tier: 'decouverte',
      max: 30,
      remaining: 2,
    });
    const res = await POST(makeReq(baseFields({ variantCount: '3' })), ctx());
    expect(res.status).toBe(402);
    expect(mockGenerate).not.toHaveBeenCalled();
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
