// Enhance (2026-10-08): multipart, one reference image per ticked
// improvement, the free text alone allowed, an explicit ratio passed on.
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
  mockDetectMaterials,
} = vi.hoisted(() => ({
  mockEnforceGenerationRateLimit: vi.fn(),
  mockGenerate: vi.fn(),
  mockIsEngineConfigured: vi.fn(),
  mockModerateImage: vi.fn(),
  mockCheckTierQuota: vi.fn(),
  mockRecordTierUsage: vi.fn(),
  mockDetectMaterials: vi.fn(),
}));

vi.mock('@/lib/server/materials/detect-and-merge', () => ({
  detectAndMergeMaterials: mockDetectMaterials,
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

function makeReq(
  fields: Record<string, string | string[]>,
  files: Record<string, File> = {},
): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const one of Array.isArray(v) ? v : [v]) form.append(k, one);
  }
  for (const [k, f] of Object.entries(files)) form.append(k, f);

  return new NextRequest(`https://test/api/projects/${PROJECT_ID}/enhance`, {
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

function baseFields(overrides: Record<string, string | string[]> = {}) {
  return {
    sourceNodeId: SOURCE_NODE_ID,
    engine: 'nanobanana',
    strength: 'subtle',
    options: ['lighting'],
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

describe('POST /api/projects/[projectId]/enhance', () => {
  it('400s when nothing is ticked and nothing is described', async () => {
    const res = await POST(makeReq(baseFields({ options: [] })), ctx());
    expect(res.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('runs on the free text alone, nothing ticked', async () => {
    const res = await POST(
      makeReq(baseFields({ options: [], instruction: 'brighter interior' })),
      ctx(),
    );
    expect(res.status).toBe(201);
    const input = mockGenerate.mock.calls[0]?.[1] as { prompt: string };
    expect(input.prompt.endsWith('brighter interior')).toBe(true);
  });

  it('refuses a reference for an improvement that is not ticked', async () => {
    const res = await POST(makeReq(baseFields(), { ref_sky: pngFile() }), ctx());
    expect(res.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('sends each reference to the engine and names it in the prompt', async () => {
    const res = await POST(
      makeReq(baseFields({ options: ['lighting', 'materials'] }), { ref_materials: pngFile() }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const input = mockGenerate.mock.calls[0]?.[1] as {
      prompt: string;
      referenceImages?: unknown[];
    };
    expect(input.referenceImages).toHaveLength(1);
    expect(input.prompt).toContain('Image 2 is a reference for');
  });

  it('keeps the framing on auto and passes an explicit ratio on', async () => {
    await POST(makeReq(baseFields()), ctx());
    expect(mockGenerate.mock.calls[0]?.[1]).not.toHaveProperty('aspectRatio');
    await POST(makeReq(baseFields({ ratio: '1:1' })), ctx());
    expect(mockGenerate.mock.calls[1]?.[1]).toMatchObject({ aspectRatio: '1:1' });
  });

  it('422s when moderation flags a reference, before any generation', async () => {
    mockModerateImage.mockResolvedValueOnce({ flagged: true, categories: ['violence'] });
    const res = await POST(
      makeReq(baseFields({ options: ['materials'] }), { ref_materials: pngFile() }),
      ctx(),
    );
    expect(res.status).toBe(422);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
