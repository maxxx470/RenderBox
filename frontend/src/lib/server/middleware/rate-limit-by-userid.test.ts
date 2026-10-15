import { describe, it, expect, vi, afterEach } from 'vitest';

// Production without Upstash, as RenderPro runs on Vercel.
vi.mock('@/lib/server/redis', () => ({ redis: null }));

import { enforceAdminRateLimit } from './rate-limit-by-userid';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('enforceAdminRateLimit without Redis', () => {
  it('lets an admin through in production (the /admin access check must not fail)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(await enforceAdminRateLimit('admin-a')).toBeNull();
  });

  it('still limits: the 101st request in a minute is a 429', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (let i = 0; i < 100; i++) expect(await enforceAdminRateLimit('admin-b')).toBeNull();
    const res = await enforceAdminRateLimit('admin-b');
    expect(res?.status).toBe(429);
    // Another admin keeps their own budget.
    expect(await enforceAdminRateLimit('admin-c')).toBeNull();
  });

  it('answers 503 when ADMIN_RATE_LIMIT_FAIL_CLOSED=1', async () => {
    vi.stubEnv('ADMIN_RATE_LIMIT_FAIL_CLOSED', '1');
    const res = await enforceAdminRateLimit('admin-d');
    expect(res?.status).toBe(503);
  });
});
