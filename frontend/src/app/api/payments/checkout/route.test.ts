import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn() }));
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/payments/maketou', () => ({
  maketouCheckout: vi.fn(),
  isMaketouConfigured: vi.fn(),
  getTierAmount: vi.fn(() => 15000),
}));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { maketouCheckout, isMaketouConfigured } from '@/lib/server/payments/maketou';
import { POST } from './route';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAuth = vi.mocked(requireAuth);
const mockCheckout = vi.mocked(maketouCheckout);
const mockConfigured = vi.mocked(isMaketouConfigured);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeReq(body: unknown = { tier: 'standard' }): NextRequest {
  return new NextRequest('http://test/api/payments/checkout', {
    method: 'POST',
    headers: { 'x-csrf-token': 'x', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockConfigured.mockReturnValue(true);
});

describe('POST /api/payments/checkout', () => {
  it('creates a PENDING Order for the requested tier, calls maketouCheckout, persists cartId + paymentUrl, returns 201', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'me@example.com',
      name: 'Me',
    } as never);
    prismaMock.order.create.mockResolvedValueOnce({ id: 'order-1' } as never);
    mockCheckout.mockResolvedValueOnce({
      cartId: 'cart-1',
      redirectUrl: 'https://maketou.example/pay/cart-1',
    });
    prismaMock.order.update.mockResolvedValueOnce({} as never);

    const res = await POST(makeReq({ tier: 'standard' }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { orderId: string; paymentUrl: string };
    expect(body).toEqual({ orderId: 'order-1', paymentUrl: 'https://maketou.example/pay/cart-1' });
    expect(mockConfigured).toHaveBeenCalledWith('standard');
    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'maketou',
          status: 'PENDING',
          amount: 15000,
          metadata: { tier: 'standard' },
        }),
      }),
    );
    expect(mockCheckout).toHaveBeenCalledWith(expect.objectContaining({ tier: 'standard' }));
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { providerChargeId: 'cart-1', paymentUrl: 'https://maketou.example/pay/cart-1' },
      }),
    );
  });

  it('400 VALIDATION_FAILED for an unknown tier', async () => {
    const res = await POST(makeReq({ tier: 'unknown' }));
    expect(res.status).toBe(400);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('503 PAYMENT_PROVIDER_UNCONFIGURED without creating an Order', async () => {
    mockConfigured.mockReturnValueOnce(false);
    const res = await POST(makeReq());
    expect(res.status).toBe(503);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('marks the Order FAILED and returns 502 when maketouCheckout throws', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'me@example.com',
      name: null,
    } as never);
    prismaMock.order.create.mockResolvedValueOnce({ id: 'order-1' } as never);
    mockCheckout.mockRejectedValueOnce(new Error('network error'));
    prismaMock.order.update.mockResolvedValueOnce({} as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(502);
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });

  it('propagates CSRF failure without an auth check', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('404 USER_NOT_FOUND if the authed user row is missing', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makeReq());
    expect(res.status).toBe(404);
  });
});
