// Enhance: multipart, the free text alone allowed, an explicit ratio passed
// on; since 2026-10-19 eight boxes, three intensities and no reference image.
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
import { ENHANCE_OPTION_KEYS } from '@/lib/server/generation/enhance';
import { buildEnhancePrompt } from '@/lib/server/generation/enhance-prompt';

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
  mockDebitCredits.mockReset().mockResolvedValue({ ok: true, balance: 2950 });
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

  it('runs on the free text alone, nothing ticked, as a request limited to what it names', async () => {
    const res = await POST(
      makeReq(baseFields({ options: [], instruction: 'brighter interior' })),
      ctx(),
    );
    expect(res.status).toBe(201);
    const input = mockGenerate.mock.calls[0]?.[1] as { prompt: string };
    expect(input.prompt).toBe(
      buildEnhancePrompt({
        engine: 'nanobanana',
        options: [],
        strength: 'subtle',
        instruction: 'brighter interior',
      }),
    );
    expect(input.prompt).toContain('Only modify what this request explicitly names');
  });

  it.each(['ref_sky', 'ref_materials'])(
    'refuses any reference image (%s): only the source is sent (D8)',
    async (field) => {
      const res = await POST(
        makeReq(baseFields({ options: ['sky', 'materials'] }), { [field]: pngFile() }),
        ctx(),
      );
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('REFERENCES_NOT_ACCEPTED');
      expect(mockGenerate).not.toHaveBeenCalled();
      expect(mockDebitCredits).not.toHaveBeenCalled();
      expect(mockModerateImage).not.toHaveBeenCalled();
    },
  );

  it('keeps the framing on auto and passes an explicit ratio on', async () => {
    await POST(makeReq(baseFields()), ctx());
    expect(mockGenerate.mock.calls[0]?.[1]).not.toHaveProperty('aspectRatio');
    await POST(makeReq(baseFields({ ratio: '1:1' })), ctx());
    expect(mockGenerate.mock.calls[1]?.[1]).toMatchObject({ aspectRatio: '1:1' });
  });

  it('accepts the three intensities and refuses another', async () => {
    for (const strength of ['subtle', 'medium', 'strong']) {
      const res = await POST(makeReq(baseFields({ strength })), ctx());
      expect(res.status).toBe(201);
    }
    const res = await POST(makeReq(baseFields({ strength: 'extreme' })), ctx());
    expect(res.status).toBe(400);
  });

  it('« Ambiance » needs its profile', async () => {
    const res = await POST(makeReq(baseFields({ options: ['ambiance'] })), ctx());
    expect(res.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
    const ok = await POST(
      makeReq(baseFields({ options: ['ambiance'], ambiance: 'nuit_ext' })),
      ctx(),
    );
    expect(ok.status).toBe(201);
  });
});

// What the engine actually receives from Améliorer (2026-10-19, the owner's
// prompt audit): the prompt built by the server from the ticked boxes, only
// the source image, ratio, size and engine.
describe('POST /api/projects/[projectId]/enhance — what reaches the engine', () => {
  const SOURCE_BYTES = Buffer.from('source-node-bytes');

  function engineCall(index = 0) {
    const [engine, input] = mockGenerate.mock.calls[index] as [
      string,
      Record<string, unknown> & {
        prompt: string;
        sourceImageBuffer: Buffer;
        referenceImages?: { buffer: Buffer; mimeType: string }[];
      },
    ];
    return { engine, input };
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
  });

  it('builds the prompt from the boxes, « pièce sombre » and the profile', async () => {
    await POST(
      makeReq(
        baseFields({
          options: ['sky', 'lighting', 'ambiance'],
          strength: 'medium',
          darkRoom: '1',
          ambiance: 'jour_int',
          instruction: 'Ambiance de fin de journée',
        }),
      ),
      ctx(),
    );
    expect(engineCall().input.prompt).toBe(
      buildEnhancePrompt({
        engine: 'nanobanana',
        options: ['sky', 'lighting', 'ambiance'],
        strength: 'medium',
        darkRoom: true,
        ambiance: 'jour_int',
        instruction: 'Ambiance de fin de journée',
      }),
    );
  });

  it('ignores « pièce sombre » and the profile when their box is not ticked', async () => {
    await POST(
      makeReq(baseFields({ options: ['sharpness'], darkRoom: '1', ambiance: 'nuit_int' })),
      ctx(),
    );
    expect(engineCall().input.prompt).toBe(
      buildEnhancePrompt({ engine: 'nanobanana', options: ['sharpness'], strength: 'subtle' }),
    );
  });

  it('lays the prompt out for the chosen engine', async () => {
    await POST(makeReq(baseFields({ engine: 'gpt_image' })), ctx());
    expect(engineCall().input.prompt).toBe(
      buildEnhancePrompt({ engine: 'gpt_image', options: ['lighting'], strength: 'subtle' }),
    );
  });

  it('sends the source image only: no reference field', async () => {
    await POST(
      makeReq(baseFields({ options: [...ENHANCE_OPTION_KEYS], ambiance: 'jour_ext' })),
      ctx(),
    );
    const { input } = engineCall();
    expect(global.fetch).toHaveBeenCalledWith('https://blob.test/source.png');
    expect(input.sourceImageBuffer.equals(SOURCE_BYTES)).toBe(true);
    expect(input).not.toHaveProperty('referenceImages');
    expect(input.prompt.toLowerCase()).not.toContain('reference');
  });

  it('passes the engine, an explicit ratio and the size on', async () => {
    await POST(makeReq(baseFields({ engine: 'gpt_image', ratio: '3:2', resolution: '4k' })), ctx());
    const { engine, input } = engineCall();
    expect(engine).toBe('gpt_image');
    expect(input).toMatchObject({ aspectRatio: '3:2', resolution: '4k' });
  });

  it("sends the default size (1k) when none is chosen, and no ratio on 'auto'", async () => {
    await POST(makeReq(baseFields()), ctx());
    expect(engineCall().input.resolution).toBe('1k');
    expect(engineCall().input).not.toHaveProperty('aspectRatio');
  });

  it('never adds the project sheet nor re-reads the materials', async () => {
    prismaMock.material.findMany.mockResolvedValue([
      { face: 'toiture', valeur: 'Tuile', source: 'auto', confidence: 80 },
    ] as never);
    await POST(makeReq(baseFields()), ctx());
    expect(engineCall().input.prompt).not.toContain('Tuile');
    expect(mockDetectMaterials).not.toHaveBeenCalled();
  });
});

// Étape 3B.4: an engine that ran out of time is a 504 GENERATION_TIMEOUT.
describe('POST /api/projects/[projectId]/enhance — engine deadline (étape 3B.4)', () => {
  it('declares a 300 s maxDuration', () => {
    expect(maxDuration).toBe(300);
  });

  it('504s with GENERATION_TIMEOUT when the engine runs out of time, and charges nothing', async () => {
    mockGenerate.mockRejectedValueOnce(new EngineTimeoutError('gpt_image', 180_000));
    const res = await POST(makeReq(baseFields()), ctx());
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({
      code: 'GENERATION_TIMEOUT',
      message: 'Generation timed out',
    });
    // Debited before the engine, given back: nothing was produced.
    expect(mockRefundCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 4);
  });

  it('keeps 502 GENERATION_FAILED for any other engine error', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('engine down'));
    const res = await POST(makeReq(baseFields()), ctx());
    expect(res.status).toBe(502);
    expect(((await res.json()) as { code: string }).code).toBe('GENERATION_FAILED');
  });
});

describe('POST /api/projects/[projectId]/enhance — credits', () => {
  it('debits one image at the grid price, before the engine: Visio 6 at 2K, 9 at 4K', async () => {
    expect((await POST(makeReq(baseFields({ resolution: '2k' })), ctx())).status).toBe(201);
    expect(mockDebitCredits).toHaveBeenLastCalledWith(prismaMock, USER_ID, 6);
    expect(mockDebitCredits.mock.invocationCallOrder[0]).toBeLessThan(
      mockGenerate.mock.invocationCallOrder[0]!,
    );
    expect((await POST(makeReq(baseFields({ resolution: '4k' })), ctx())).status).toBe(201);
    expect(mockDebitCredits).toHaveBeenLastCalledWith(prismaMock, USER_ID, 9);
    expect(mockRefundCredits).not.toHaveBeenCalled();
  });

  it('Pixel IA is priced at its own grid: 6 / 10 / 16', async () => {
    for (const [resolution, cost] of [
      ['1k', 6],
      ['2k', 10],
      ['4k', 16],
    ] as const) {
      await POST(makeReq(baseFields({ engine: 'gpt_image', resolution })), ctx());
      expect(mockDebitCredits).toHaveBeenLastCalledWith(prismaMock, USER_ID, cost);
    }
  });

  it('402s with INSUFFICIENT_CREDITS before any engine call', async () => {
    mockDebitCredits.mockResolvedValue({ ok: false, reason: 'INSUFFICIENT_CREDITS', balance: 20 });
    const res = await POST(makeReq(baseFields()), ctx());
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: 'INSUFFICIENT_CREDITS', cost: 4, balance: 20 });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockEnforceGenerationRateLimit).not.toHaveBeenCalled();
  });

  it('refunds the credits when the engine fails', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('engine down'));
    const res = await POST(makeReq(baseFields({ resolution: '4k' })), ctx());
    expect(res.status).toBe(502);
    expect(mockRefundCredits).toHaveBeenCalledWith(prismaMock, USER_ID, 9);
  });
});
