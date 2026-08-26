import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));

const purgeDeletedAccountsMock = vi.fn();
vi.mock('@/lib/server/users/soft-delete', () => ({
  purgeDeletedAccounts: purgeDeletedAccountsMock,
}));

vi.mock('@/lib/server/prisma', () => ({ prisma: {} }));

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  purgeDeletedAccountsMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/account-purge', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('POST /api/cron/account-purge', () => {
  it('returns 401 when verifyCronSecret fails', async () => {
    const { verifyCronSecret } = await import('@/lib/server/cron/auth');
    (verifyCronSecret as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('calls purgeDeletedAccounts with prisma and returns purged/skipped counts', async () => {
    purgeDeletedAccountsMock.mockResolvedValueOnce({ purged: 3, skipped: 1 });
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(purgeDeletedAccountsMock).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, purged: 3, skipped: 1 });
  });
});
