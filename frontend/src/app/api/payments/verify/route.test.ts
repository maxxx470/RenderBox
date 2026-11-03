// GET /api/payments/verify — the return page's way of settling an order.
// It accepts a cart id as well as an orderId, because a provider may redirect
// to the fallback URL set in its own dashboard rather than the one we handed
// it — and then nothing of ours is on the URL.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/payments/moneriz-reconcile', () => ({ reconcileMonerizOrder: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { reconcileMonerizOrder } from '@/lib/server/payments/moneriz-reconcile';
import { MonerizApiError, MonerizNotConfiguredError } from '@/lib/server/payments/moneriz';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockReconcile = vi.mocked(reconcileMonerizOrder);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

const ORDER = {
  id: 'o1',
  userId: 'user-1',
  status: 'PENDING',
  providerChargeId: 'cs_1',
  provider: 'moneriz',
  metadata: { tier: 'standard' },
  amount: 15000,
  currency: 'XOF',
};

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
    prismaMock.order.findFirst.mockResolvedValueOnce(ORDER as never);
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
      ...ORDER,
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

// A provider that redirects to the URL set in ITS dashboard sends no orderId
// of ours. Without this the customer's own payment could not be found.
describe('finding the order by payment token', () => {
  it('looks the order up by providerChargeId when only a cart id is given', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce(ORDER as never);
    mockReconcile.mockResolvedValueOnce({ changed: true, status: 'PAID' });

    const res = await GET(makeReq('token=cs_1'));

    expect(res.status).toBe(200);
    const where = prismaMock.order.findFirst.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toEqual({ providerChargeId: 'cs_1' });
  });

  it('still refuses another account’s order found by token', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce({
      ...ORDER,
      userId: 'someone-else',
    } as never);

    const res = await GET(makeReq('token=cs_1'));

    // The token is not a credential: the order is still checked against the
    // signed-in account, so knowing a token grants nothing.
    expect(res.status).toBe(404);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('prefers the orderId when both are given', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce(ORDER as never);
    mockReconcile.mockResolvedValueOnce({ changed: false, status: 'PENDING' });

    await GET(makeReq('orderId=o1&token=cs_1'));

    const where = prismaMock.order.findFirst.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toEqual({ id: 'o1' });
  });
});

describe('when Moneriz itself is unreachable', () => {
  it('falls back to the last-known local status on a transient MonerizApiError', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce(ORDER as never);
    mockReconcile.mockRejectedValueOnce(new MonerizApiError('boom', 502));

    const res = await GET(makeReq('orderId=o1'));

    // Never 502 the customer's return page over a provider hiccup: the cron
    // reconciles anyway.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'PENDING' });
  });

  it('503 when Moneriz is not configured', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce(ORDER as never);
    mockReconcile.mockRejectedValueOnce(new MonerizNotConfiguredError());

    const res = await GET(makeReq('orderId=o1'));

    expect(res.status).toBe(503);
  });

  it('404 for an order from the removed provider — nothing of its can settle any more', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce({
      ...ORDER,
      provider: 'maketou',
    } as never);
    const res = await GET(makeReq('orderId=o1'));
    expect(res.status).toBe(404);
  });
});
