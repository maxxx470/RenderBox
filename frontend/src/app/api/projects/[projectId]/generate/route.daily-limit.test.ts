// Étape 3C.3-R2 — the daily generation limit as /generate really spends it:
// the REAL limiter (rate-limit-generation.ts + RedisRateLimitStore) on an
// in-memory stand-in for Redis, so the net count of a request can be read.
// route.test.ts mocks the limiter module as a whole, which is why these live
// in their own file. Everything else (engine, storage, quota, detector) is
// mocked as in route.test.ts. A simulation: it says nothing of real Redis
// under real concurrency — INCR / DECR are atomic there by contract.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyToken: vi.fn() };
});

const { counters, fakeRedis } = vi.hoisted(() => {
  const counters = new Map<string, number>();
  const fakeRedis = {
    incr: vi.fn(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    decr: vi.fn(async (key: string) => {
      const next = (counters.get(key) ?? 0) - 1;
      counters.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
  };
  return { counters, fakeRedis };
});
vi.mock('@/lib/server/redis', () => ({ redis: fakeRedis }));

const { mockDebitCredits, mockRefundCredits, mockGenerate, mockIsEngineConfigured } = vi.hoisted(
  () => ({
    mockDebitCredits: vi.fn(),
    mockRefundCredits: vi.fn(),
    mockGenerate: vi.fn(),
    mockIsEngineConfigured: vi.fn(),
  }),
);
vi.mock('@/lib/server/generation/tier-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/generation/tier-quota')>()),
  debitCredits: mockDebitCredits,
  refundCredits: mockRefundCredits,
}));
vi.mock('@/lib/server/generation/engines', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/generation/engines')>(
    '@/lib/server/generation/engines',
  );
  return { ...actual, generateRender: mockGenerate, isEngineConfigured: mockIsEngineConfigured };
});
vi.mock('@/lib/server/upload/vercel-blob-client', () => ({
  uploadBuffer: vi.fn().mockResolvedValue({ blobUrl: 'https://blob.test/out.png', bytes: 123 }),
  StorageNotConfiguredError: class StorageNotConfiguredError extends Error {},
}));
vi.mock('@/lib/server/materials/detect-and-merge', () => ({
  detectAndMergeMaterials: vi.fn().mockResolvedValue(undefined),
}));

import { verifyToken } from '@/lib/server/auth';
import { POST } from './route';

const USER_ID = 'user-1';
const OTHER_USER = 'user-2';
const PROJECT_ID = 'project-1';
const SOURCE_NODE_ID = 'node-source';
const KEY = (user: string) => `rl:generation:userid:${user}`;
const MAX = 3;

function makeReq(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest(`https://test/api/projects/${PROJECT_ID}/generate`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-access-token',
      'x-csrf-token': 'csrf-tok',
      cookie: 'app-csrf=csrf-tok',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ sourceNodeId: SOURCE_NODE_ID, engine: 'nanobanana', ...body }),
  });
}
const ctx = () => ({ params: Promise.resolve({ projectId: PROJECT_ID }) });

function signIn(user: string) {
  vi.mocked(verifyToken).mockResolvedValue({
    sub: user,
    email: `${user}@test.local`,
    tokenVersion: 0,
  });
  prismaMock.user.findUnique.mockResolvedValue({
    id: user,
    email: `${user}@test.local`,
    tokenVersion: 0,
  } as never);
  prismaMock.project.findUnique.mockResolvedValue({ userId: user } as never);
}

beforeEach(() => {
  __cookieStore.clear();
  counters.clear();
  fakeRedis.incr.mockClear();
  fakeRedis.decr.mockClear();
  process.env.GENERATION_RATE_LIMIT_MAX_PER_DAY = String(MAX);
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  vi.mocked(verifyToken).mockReset();
  signIn(USER_ID);
  mockIsEngineConfigured.mockReset().mockReturnValue(true);
  mockDebitCredits.mockReset().mockResolvedValue({ ok: true, balance: 2950 });
  mockRefundCredits.mockReset().mockResolvedValue(undefined);
  mockGenerate
    .mockReset()
    .mockResolvedValue({ imageBuffer: Buffer.from('img'), mimeType: 'image/png' });
  prismaMock.renderNode.findUnique.mockResolvedValue({
    id: SOURCE_NODE_ID,
    projectId: PROJECT_ID,
    blobUrl: 'https://blob.test/source.png',
    mimeType: 'image/png',
  } as never);
  prismaMock.materialDetection.findMany.mockResolvedValue([] as never);
  prismaMock.materialCorrection.findMany.mockResolvedValue([] as never);
  prismaMock.material.findMany.mockResolvedValue([]);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
  prismaMock.renderNode.create.mockResolvedValue({ id: 'node-new' } as never);
  prismaMock.generation.create.mockResolvedValue({ id: 'gen-1' } as never);
  prismaMock.renderNode.findMany.mockResolvedValue([]);
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
  }) as unknown as typeof fetch;
});

describe('POST /generate — the daily unit, counted on the real limiter (étape 3C.3-R2)', () => {
  it.each([
    ['an invalid body', () => {}, { engine: 'not_a_real_engine' }, 400],
    [
      'an unknown source node',
      () => prismaMock.renderNode.findUnique.mockResolvedValue(null as never),
      {},
      404,
    ],
    ['an engine not configured', () => mockIsEngineConfigured.mockReturnValue(false), {}, 503],
    [
      'unreadable materials (MATERIALS_UNAVAILABLE)',
      () =>
        prismaMock.materialCorrection.findMany.mockRejectedValue(
          Object.assign(new Error('db down'), { code: 'P1001' }),
        ),
      {},
      503,
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
    ],
  ] as const)('%s: no INCR at all, the counter stays at 0', async (_l, arrange, body, status) => {
    arrange();
    const res = await POST(makeReq(body), ctx());
    expect(res.status).toBe(status);
    expect(fakeRedis.incr).not.toHaveBeenCalled();
    expect(fakeRedis.decr).not.toHaveBeenCalled();
    expect(counters.get(KEY(USER_ID)) ?? 0).toBe(0);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('a success counts exactly one unit', async () => {
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(201);
    expect(fakeRedis.incr).toHaveBeenCalledTimes(1);
    expect(fakeRedis.decr).not.toHaveBeenCalled();
    expect(counters.get(KEY(USER_ID))).toBe(1);
  });

  it('an engine failure after the limit keeps its one unit (an attempt that started)', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('engine down'));
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(502);
    expect(fakeRedis.incr).toHaveBeenCalledTimes(1);
    expect(fakeRedis.decr).not.toHaveBeenCalled();
    expect(counters.get(KEY(USER_ID))).toBe(1);
  });

  it('the limit stays effective, and a 429 leaves no net unit for the refused request', async () => {
    for (let i = 0; i < MAX; i++) {
      expect((await POST(makeReq(), ctx())).status).toBe(201);
    }
    expect(counters.get(KEY(USER_ID))).toBe(MAX);
    mockGenerate.mockClear();

    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe('GENERATION_DAILY_LIMIT_EXCEEDED');
    // The limiter's own rollback (unchanged): one INCR, one DECR, net zero.
    expect(counters.get(KEY(USER_ID))).toBe(MAX);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('a user at the limit still gets the precondition error first, and the counter does not move', async () => {
    counters.set(KEY(USER_ID), MAX);
    prismaMock.renderNode.findUnique.mockResolvedValue(null as never);
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(404);
    expect(fakeRedis.incr).not.toHaveBeenCalled();
    expect(counters.get(KEY(USER_ID))).toBe(MAX);
  });

  it('concurrent requests: each takes its own unit, a failing one takes none, nothing is given back', async () => {
    // Request 3 fails on its materials read; 1 and 2 are valid; 4 is another user.
    prismaMock.materialCorrection.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockRejectedValueOnce(Object.assign(new Error('db down'), { code: 'P1001' }))
      .mockResolvedValue([] as never);
    const results = await Promise.all([
      POST(makeReq(), ctx()),
      POST(makeReq(), ctx()),
      POST(makeReq(), ctx()),
    ]);
    signIn(OTHER_USER);
    const other = await POST(makeReq(), ctx());

    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 503]);
    expect(other.status).toBe(201);
    expect(counters.get(KEY(USER_ID))).toBe(2);
    expect(counters.get(KEY(OTHER_USER))).toBe(1);
    expect(fakeRedis.incr).toHaveBeenCalledTimes(3);
    expect(fakeRedis.decr).not.toHaveBeenCalled();
  });
});
