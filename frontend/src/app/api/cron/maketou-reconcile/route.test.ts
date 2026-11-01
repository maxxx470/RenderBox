import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));
vi.mock('@/lib/server/payments/maketou', () => ({ isMaketouApiConfigured: vi.fn(() => true) }));
vi.mock('@/lib/server/payments/moneyfusion', () => ({
  isMoneyfusionConfigured: vi.fn(() => true),
}));

const reconcileMock = vi.fn();
vi.mock('@/lib/server/payments/maketou-reconcile', () => ({
  reconcileMaketouOrder: reconcileMock,
}));
const reconcileFusionMock = vi.fn();
vi.mock('@/lib/server/payments/moneyfusion-reconcile', () => ({
  reconcileMoneyfusionOrder: reconcileFusionMock,
}));

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  reconcileMock.mockReset();
  reconcileFusionMock.mockReset();
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

  it('skips DB work when no provider is configured', async () => {
    const { isMaketouApiConfigured } = await import('@/lib/server/payments/maketou');
    const { isMoneyfusionConfigured } = await import('@/lib/server/payments/moneyfusion');
    (isMaketouApiConfigured as Mock).mockReturnValueOnce(false);
    (isMoneyfusionConfigured as Mock).mockReturnValueOnce(false);
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, checked: 0, changed: 0 });
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
  });

  // It sweeps BOTH providers since 2026-11-01 and routes each order to its
  // own reconcile — a MoneyFusion order checked against Maketou's API would
  // never settle, and vice versa.
  it('reconciles every PENDING order through its own provider, and counts changes', async () => {
    prismaMock.order.findMany.mockResolvedValueOnce([
      { id: 'o1', status: 'PENDING', providerChargeId: 'tok1', provider: 'moneyfusion' },
      { id: 'o2', status: 'PENDING', providerChargeId: 'c2', provider: 'maketou' },
    ] as never);
    reconcileFusionMock.mockResolvedValueOnce({ changed: true, status: 'PAID' });
    reconcileMock.mockResolvedValueOnce({ changed: false, status: 'PENDING' });

    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, checked: 2, changed: 1 });
    expect(reconcileFusionMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ id: 'o1' }),
    );
    expect(reconcileMock).toHaveBeenCalledWith(prismaMock, expect.objectContaining({ id: 'o2' }));
    const where = prismaMock.order.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toEqual({ provider: { in: ['moneyfusion', 'maketou'] }, status: 'PENDING' });
  });

  it('only sweeps the providers that are configured', async () => {
    const { isMaketouApiConfigured } = await import('@/lib/server/payments/maketou');
    (isMaketouApiConfigured as Mock).mockReturnValueOnce(false);
    prismaMock.order.findMany.mockResolvedValueOnce([] as never);

    const { POST } = await import('./route');
    await POST(makeReq());

    const where = prismaMock.order.findMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toEqual({ provider: { in: ['moneyfusion'] }, status: 'PENDING' });
  });

  it('continues the batch when one reconcile call throws', async () => {
    prismaMock.order.findMany.mockResolvedValueOnce([
      { id: 'o1', status: 'PENDING', providerChargeId: 'tok1', provider: 'moneyfusion' },
      { id: 'o2', status: 'PENDING', providerChargeId: 'tok2', provider: 'moneyfusion' },
    ] as never);
    reconcileFusionMock.mockRejectedValueOnce(new Error('provider down'));
    reconcileFusionMock.mockResolvedValueOnce({ changed: true, status: 'PAID' });

    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, checked: 2, changed: 1 });
  });
});
