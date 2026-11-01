// GET /api/payments/verify — the return page's way of settling an order.
// Routes on the ORDER's own provider since 2026-11-01, and accepts a payment
// token as well as an orderId, because a provider may redirect to the
// fallback URL set in its own dashboard rather than the one we handed it.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/payments/maketou-reconcile', () => ({ reconcileMaketouOrder: vi.fn() }));
vi.mock('@/lib/server/payments/moneyfusion-reconcile', () => ({
  reconcileMoneyfusionOrder: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { reconcileMaketouOrder } from '@/lib/server/payments/maketou-reconcile';
import { reconcileMoneyfusionOrder } from '@/lib/server/payments/moneyfusion-reconcile';
import { MaketouApiError, MaketouNotConfiguredError } from '@/lib/server/payments/maketou';
import {
  MoneyfusionApiError,
  MoneyfusionNotConfiguredError,
} from '@/lib/server/payments/moneyfusion';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockReconcile = vi.mocked(reconcileMaketouOrder);
const mockReconcileFusion = vi.mocked(reconcileMoneyfusionOrder);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

const MAKETOU_ORDER = {
  id: 'o1',
  userId: 'user-1',
  status: 'PENDING',
  providerChargeId: 'cart-1',
  provider: 'maketou',
  metadata: { tier: 'standard' },
  amount: 15000,
};
const FUSION_ORDER = { ...MAKETOU_ORDER, providerChargeId: 'tok-1', provider: 'moneyfusion' };

function makeReq(query?: string): NextRequest {
  return new NextRequest(
    query ? `http://test/api/payments/verify?${query}` : 'http://test/api/payments/verify',
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
});

describe('GET /api/payments/verify', () => {
  it("returns the reconciled status for the caller's own order", async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce(MAKETOU_ORDER as never);
    mockReconcile.mockResolvedValueOnce({ changed: true, status: 'PAID' });

    const res = await GET(makeReq('orderId=o1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'PAID' });
  });

  it('400 when neither an orderId nor a token is given', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(400);
    expect(prismaMock.order.findFirst).not.toHaveBeenCalled();
  });

  it("404 when the order doesn't exist or belongs to another user", async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce({
      ...MAKETOU_ORDER,
      userId: 'someone-else',
    } as never);
    const res = await GET(makeReq('orderId=o1'));
    expect(res.status).toBe(404);
  });

  it('propagates 401 from requireAuth without a DB hit', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeReq('orderId=o1'));
    expect(res.status).toBe(401);
    expect(prismaMock.order.findFirst).not.toHaveBeenCalled();
  });
});

// The provider is read off the ORDER, not off whichever one is configured
// today: a Maketou order made before the switch must still settle after it.
describe('each order settles through its own provider', () => {
  it('a MoneyFusion order goes to the MoneyFusion reconcile', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce(FUSION_ORDER as never);
    mockReconcileFusion.mockResolvedValueOnce({ changed: true, status: 'PAID' });

    const res = await GET(makeReq('orderId=o1'));

    expect(await res.json()).toEqual({ status: 'PAID' });
    expect(mockReconcileFusion).toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('a Maketou order goes to the Maketou reconcile', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce(MAKETOU_ORDER as never);
    mockReconcile.mockResolvedValueOnce({ changed: false, status: 'PENDING' });

    await GET(makeReq('orderId=o1'));

    expect(mockReconcile).toHaveBeenCalled();
    expect(mockReconcileFusion).not.toHaveBeenCalled();
  });

  it('404 for an order from a provider this route does not settle', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce({
      ...MAKETOU_ORDER,
      provider: 'bictorys',
    } as never);
    const res = await GET(makeReq('orderId=o1'));
    expect(res.status).toBe(404);
  });
});

// A provider that redirects to the URL set in ITS dashboard sends no orderId
// of ours. Without this the customer's own payment could not be found.
describe('finding the order by payment token', () => {
  it('looks the order up by providerChargeId when only a token is given', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce(FUSION_ORDER as never);
    mockReconcileFusion.mockResolvedValueOnce({ changed: true, status: 'PAID' });

    const res = await GET(makeReq('token=tok-1'));

    expect(res.status).toBe(200);
    const where = prismaMock.order.findFirst.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toEqual({ providerChargeId: 'tok-1' });
  });

  it('still refuses another account’s order found by token', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce({
      ...FUSION_ORDER,
      userId: 'someone-else',
    } as never);

    const res = await GET(makeReq('token=tok-1'));

    // The token is not a credential: the order is still checked against the
    // signed-in account, so knowing a token grants nothing.
    expect(res.status).toBe(404);
    expect(mockReconcileFusion).not.toHaveBeenCalled();
  });

  it('prefers the orderId when both are given', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce(FUSION_ORDER as never);
    mockReconcileFusion.mockResolvedValueOnce({ changed: false, status: 'PENDING' });

    await GET(makeReq('orderId=o1&token=tok-1'));

    const where = prismaMock.order.findFirst.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toEqual({ id: 'o1' });
  });
});

describe('when the provider itself is unreachable', () => {
  it.each([
    [
      'Maketou',
      MAKETOU_ORDER,
      () => mockReconcile.mockRejectedValueOnce(new MaketouApiError('boom', 502)),
    ],
    [
      'MoneyFusion',
      FUSION_ORDER,
      () => mockReconcileFusion.mockRejectedValueOnce(new MoneyfusionApiError('boom', 502)),
    ],
  ] as const)('falls back to the last-known local status (%s)', async (_name, order, arrange) => {
    prismaMock.order.findFirst.mockResolvedValueOnce(order as never);
    arrange();

    const res = await GET(makeReq('orderId=o1'));

    // Never 502 the customer's return page over a provider hiccup: the cron
    // reconciles every few minutes anyway.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'PENDING' });
  });

  it.each([
    [
      'Maketou',
      MAKETOU_ORDER,
      () => mockReconcile.mockRejectedValueOnce(new MaketouNotConfiguredError()),
    ],
    [
      'MoneyFusion',
      FUSION_ORDER,
      () => mockReconcileFusion.mockRejectedValueOnce(new MoneyfusionNotConfiguredError()),
    ],
  ] as const)('503 when the provider is not configured (%s)', async (_name, order, arrange) => {
    prismaMock.order.findFirst.mockResolvedValueOnce(order as never);
    arrange();

    const res = await GET(makeReq('orderId=o1'));

    expect(res.status).toBe(503);
  });
});
