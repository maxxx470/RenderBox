// Phase 5 — the `count` parameter lets a multi-variant edit charge N units
// in one call, and a rejection must roll back every increment it made (no
// partial charge left behind).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { store, mockRedis } = vi.hoisted(() => {
  const store = new Map<string, number>();
  const mockRedis = {
    incr: vi.fn(async (key: string) => {
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    }),
    decr: vi.fn(async (key: string) => {
      const next = (store.get(key) ?? 0) - 1;
      store.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
  };
  return { store, mockRedis };
});

vi.mock('@/lib/server/redis', () => ({ redis: mockRedis }));

import { enforceGenerationRateLimit } from './rate-limit-generation';

beforeEach(() => {
  store.clear();
  mockRedis.incr.mockClear();
  mockRedis.decr.mockClear();
  process.env.GENERATION_RATE_LIMIT_MAX_PER_DAY = '5';
});

describe('enforceGenerationRateLimit', () => {
  it('defaults to charging 1 unit per call', async () => {
    const res = await enforceGenerationRateLimit('user-1');
    expect(res).toBeNull();
    expect(mockRedis.incr).toHaveBeenCalledTimes(1);
  });

  it('charges `count` units in a single call (multi-variant edit)', async () => {
    const res = await enforceGenerationRateLimit('user-1', 3);
    expect(res).toBeNull();
    expect(mockRedis.incr).toHaveBeenCalledTimes(3);
    expect(store.get('rl:generation:userid:user-1')).toBe(3);
  });

  it('rejects with 429 when count alone exceeds the daily max', async () => {
    const res = await enforceGenerationRateLimit('user-1', 6); // max=5
    expect(res?.status).toBe(429);
  });

  it('rolls back every increment made in a rejected multi-unit call — no partial charge', async () => {
    const res = await enforceGenerationRateLimit('user-2', 10);
    expect(res?.status).toBe(429);
    expect(store.get('rl:generation:userid:user-2') ?? 0).toBe(0);
  });

  it('an already-near-limit user gets a full rollback on a request that would tip them over', async () => {
    store.set('rl:generation:userid:user-3', 4); // 1 unit of headroom left (max=5)
    const res = await enforceGenerationRateLimit('user-3', 3);
    expect(res?.status).toBe(429);
    // Started at 4, must end back at 4 (not 5, 6, or 7).
    expect(store.get('rl:generation:userid:user-3')).toBe(4);
  });
});
