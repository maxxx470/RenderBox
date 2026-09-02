// Phase 7 — per-IP upload limiter. Uploads had no rate limit before this;
// under AUTH_DISABLED every visitor shares one demo userId, so an IP key is
// what actually gives each visitor an independent bucket.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

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

import { enforceUploadRateLimit } from './rate-limit-upload';

function reqFromIp(ip: string): NextRequest {
  return new NextRequest('http://localhost/api/projects/p1/upload', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  });
}

beforeEach(() => {
  store.clear();
  mockRedis.incr.mockClear();
  process.env.UPLOAD_RATE_LIMIT_MAX_PER_HOUR = '3';
});

describe('enforceUploadRateLimit', () => {
  it('allows requests under the per-IP max', async () => {
    const res = await enforceUploadRateLimit(reqFromIp('1.2.3.4'));
    expect(res).toBeNull();
  });

  it('rejects with 429 once an IP exceeds the max', async () => {
    await enforceUploadRateLimit(reqFromIp('1.2.3.4'));
    await enforceUploadRateLimit(reqFromIp('1.2.3.4'));
    await enforceUploadRateLimit(reqFromIp('1.2.3.4'));
    const res = await enforceUploadRateLimit(reqFromIp('1.2.3.4'));
    expect(res?.status).toBe(429);
  });

  it('gives each IP its own independent bucket', async () => {
    await enforceUploadRateLimit(reqFromIp('1.2.3.4'));
    await enforceUploadRateLimit(reqFromIp('1.2.3.4'));
    await enforceUploadRateLimit(reqFromIp('1.2.3.4'));
    // IP .4 is now at the max — a different IP must still be allowed. This
    // is the whole point of the limiter: under AUTH_DISABLED every visitor
    // shares one demo userId, so per-user limiting alone would let one
    // visitor exhaust the shared bucket for everyone else.
    const res = await enforceUploadRateLimit(reqFromIp('9.9.9.9'));
    expect(res).toBeNull();
  });

  it('falls back to an "unknown" bucket when no IP header is present', async () => {
    const req = new NextRequest('http://localhost/api/projects/p1/upload', { method: 'POST' });
    const res = await enforceUploadRateLimit(req);
    expect(res).toBeNull();
    expect(store.get('rl:upload:ip:unknown')).toBe(1);
  });
});
