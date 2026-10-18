// 2026-10-18 — production has no Redis (no Upstash on Vercel). The upload and
// generation limiters then counted nothing and answered 503 to every request,
// which stopped all generation; they now count the account's images in the
// database, which every instance shares.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { count } = vi.hoisted(() => ({ count: vi.fn() }));

vi.mock('@/lib/server/redis', () => ({ redis: null }));
vi.mock('@/lib/server/prisma', () => ({ prisma: { renderNode: { count } } }));

import { enforceUploadRateLimit } from './rate-limit-upload';
import { enforceGenerationRateLimit } from './rate-limit-generation';

const req = () =>
  new NextRequest('http://localhost/api/projects/p1/upload', {
    method: 'POST',
    headers: { 'x-forwarded-for': '1.2.3.4' },
  });

beforeEach(() => {
  count.mockReset();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('UPLOAD_RATE_LIMIT_MAX_PER_HOUR', '3');
  vi.stubEnv('GENERATION_RATE_LIMIT_MAX_PER_DAY', '5');
});
afterEach(() => vi.unstubAllEnvs());

describe('without Redis in production', () => {
  it('lets an upload through under the hourly max, counting the account’s uploads', async () => {
    count.mockResolvedValue(2);
    expect(await enforceUploadRateLimit(req(), 'user-1')).toBeNull();
    const where = count.mock.calls[0]![0].where;
    expect(where).toMatchObject({ kind: 'UPLOADED', project: { userId: 'user-1' } });
    const since = where.createdAt.gte as Date;
    expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000);
    expect(Date.now() - since.getTime()).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
  });

  it('refuses the upload with 429 once the hour holds the max, never with a 503', async () => {
    count.mockResolvedValue(3);
    const res = await enforceUploadRateLimit(req(), 'user-1');
    expect(res?.status).toBe(429);
    expect((await res!.json()).error).toBe('UPLOAD_RATE_LIMIT_EXCEEDED');
    expect(res!.headers.get('Retry-After')).toBe('3600');
  });

  it('lets a render through while the day has room for every unit it asks', async () => {
    count.mockResolvedValue(2);
    expect(await enforceGenerationRateLimit('user-1', 3)).toBeNull();
    const where = count.mock.calls[0]![0].where;
    expect(where).toMatchObject({ kind: { not: 'UPLOADED' }, project: { userId: 'user-1' } });
    const since = where.createdAt.gte as Date;
    expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
  });

  it('refuses a render with 429 when its units would pass the daily max', async () => {
    count.mockResolvedValue(4);
    const res = await enforceGenerationRateLimit('user-1', 2);
    expect(res?.status).toBe(429);
    expect((await res!.json()).error).toBe('GENERATION_DAILY_LIMIT_EXCEEDED');
  });

  it('counts each account on its own', async () => {
    count.mockResolvedValue(0);
    await enforceGenerationRateLimit('user-2');
    expect(count.mock.calls[0]![0].where.project).toEqual({ userId: 'user-2' });
  });
});

describe('without Redis in development', () => {
  it('leaves both limits off and reads nothing', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(await enforceUploadRateLimit(req(), 'user-1')).toBeNull();
    expect(await enforceGenerationRateLimit('user-1')).toBeNull();
    expect(count).not.toHaveBeenCalled();
  });
});
