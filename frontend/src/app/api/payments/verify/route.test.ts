import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/payments/maketou-reconcile', () => ({ reconcileMaketouOrder: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { reconcileMaketouOrder } from '@/lib/server/payments/maketou-reconcile';
import { MaketouApiError, MaketouNotConfiguredError } from '@/lib/server/payments/maketou';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockReconcile = vi.mocked(reconcileMaketouOrder);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeReq(orderId?: string): NextRequest {
  const url = orderId
    ? `http://test/api/payments/verify?orderId=${orderId}`
    : 'http://test/api/payments/verify';
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
});

describe('GET /api/payments/verify', () => {
  it("returns the reconciled status for the caller's own order", async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({
      id: 'o1',
      userId: 'user-1',
      status: 'PENDING',
      providerChargeId: 'cart-1',
      provider: 'maketou',
    } as never);
    mockReconcile.mockResolvedValueOnce({ changed: true, status: 'PAID' });

    const res = await GET(makeReq('o1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'PAID' });
  });

  it('400 when orderId is missing', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(400);
  });

  it("404 when the order doesn't exist or belongs to another user", async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({
      id: 'o1',
      userId: 'someone-else',
      status: 'PENDING',
      providerChargeId: 'cart-1',
      provider: 'maketou',
    } as never);
    const res = await GET(makeReq('o1'));
    expect(res.status).toBe(404);
  });

  it('503 when Maketou is not configured', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({
      id: 'o1',
      userId: 'user-1',
      status: 'PENDING',
      providerChargeId: 'cart-1',
      provider: 'maketou',
    } as never);
    mockReconcile.mockRejectedValueOnce(new MaketouNotConfiguredError());
    const res = await GET(makeReq('o1'));
    expect(res.status).toBe(503);
  });

  it('falls back to the last-known local status on a transient MaketouApiError', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({
      id: 'o1',
      userId: 'user-1',
      status: 'PENDING',
      providerChargeId: 'cart-1',
      provider: 'maketou',
    } as never);
    mockReconcile.mockRejectedValueOnce(new MaketouApiError('boom', 502));
    const res = await GET(makeReq('o1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'PENDING' });
  });

  it('propagates 401 from requireAuth without a DB hit', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeReq('o1'));
    expect(res.status).toBe(401);
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
  });
});
