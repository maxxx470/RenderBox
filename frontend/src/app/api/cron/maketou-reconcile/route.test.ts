import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));
vi.mock('@/lib/server/payments/maketou', () => ({ isMaketouApiConfigured: vi.fn(() => true) }));

const reconcileMock = vi.fn();
vi.mock('@/lib/server/payments/maketou-reconcile', () => ({
  reconcileMaketouOrder: reconcileMock,
}));

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  reconcileMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/maketou-reconcile', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('POST /api/cron/maketou-reconcile', () => {
  it('returns 401 when verifyCronSecret fails', async () => {
    const { verifyCronSecret } = await import('@/lib/server/cron/auth');
    (verifyCronSecret as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('skips DB work when Maketou is not configured', async () => {
    const { isMaketouApiConfigured } = await import('@/lib/server/payments/maketou');
    (isMaketouApiConfigured as Mock).mockReturnValueOnce(false);
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, checked: 0, changed: 0 });
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
  });

  it('reconciles each PENDING maketou order and counts changes', async () => {
    prismaMock.order.findMany.mockResolvedValueOnce([
      { id: 'o1', status: 'PENDING', providerChargeId: 'c1' },
      { id: 'o2', status: 'PENDING', providerChargeId: 'c2' },
    ] as never);
    reconcileMock.mockResolvedValueOnce({ changed: true, status: 'PAID' });
    reconcileMock.mockResolvedValueOnce({ changed: false, status: 'PENDING' });

    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, checked: 2, changed: 1 });
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { provider: 'maketou', status: 'PENDING' } }),
    );
  });

  it('continues the batch when one reconcile call throws', async () => {
    prismaMock.order.findMany.mockResolvedValueOnce([
      { id: 'o1', status: 'PENDING', providerChargeId: 'c1' },
      { id: 'o2', status: 'PENDING', providerChargeId: 'c2' },
    ] as never);
    reconcileMock.mockRejectedValueOnce(new Error('provider down'));
    reconcileMock.mockResolvedValueOnce({ changed: true, status: 'PAID' });

    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, checked: 2, changed: 1 });
  });
});
