// POST /api/payments/checkout — MoneyFusion since 2026-11-01. Maketou is
// gone from this route entirely (it never took a payment: its four orders
// were all FAILED or EXPIRED), and there is no fallback on purpose.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn() }));
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/payments/moneyfusion', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/payments/moneyfusion')>(
    '@/lib/server/payments/moneyfusion',
  );
  return {
    // normalisePhone is pure — keep the real one, it is part of the contract
    // this route depends on.
    normalisePhone: actual.normalisePhone,
    moneyfusionCheckout: vi.fn(),
    isMoneyfusionConfigured: vi.fn(),
    getTierAmount: vi.fn(() => 15000),
  };
});

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { moneyfusionCheckout, isMoneyfusionConfigured } from '@/lib/server/payments/moneyfusion';
import { POST } from './route';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAuth = vi.mocked(requireAuth);
const mockCheckout = vi.mocked(moneyfusionCheckout);
const mockConfigured = vi.mocked(isMoneyfusionConfigured);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

/** An account with a phone number, the normal case. */
const USER = { id: 'user-1', email: 'me@example.com', name: 'Me', phone: '0700000000' };

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
  it('creates a PENDING MoneyFusion order, persists the token + URL, returns 201', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(USER as never);
    prismaMock.order.create.mockResolvedValueOnce({ id: 'order-1' } as never);
    mockCheckout.mockResolvedValueOnce({
      token: 'tok-1',
      paymentUrl: 'https://payin.moneyfusion.net/payment/tok-1/RenderPro',
    });
    prismaMock.order.update.mockResolvedValueOnce({} as never);

    const res = await POST(makeReq({ tier: 'standard' }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      orderId: 'order-1',
      paymentUrl: 'https://payin.moneyfusion.net/payment/tok-1/RenderPro',
    });
    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'moneyfusion',
          status: 'PENDING',
          amount: 15000,
          currency: 'XOF',
          customerPhone: '0700000000',
          metadata: { tier: 'standard' },
        }),
      }),
    );
    // The order id goes to MoneyFusion in personal_Info, which is how the
    // webhook and the status read find their way back to this row.
    expect(mockCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'standard', orderId: 'order-1', phone: '0700000000' }),
    );
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          providerChargeId: 'tok-1',
          paymentUrl: 'https://payin.moneyfusion.net/payment/tok-1/RenderPro',
        },
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

  it('marks the Order FAILED and returns 502 when the checkout throws', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ ...USER, name: null } as never);
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

// MoneyFusion will not take a payment without a number, and the onboarding
// does not require one — so this is a real account state, not an edge case.
describe('the phone number MoneyFusion requires', () => {
  it('400 PHONE_REQUIRED when neither the body nor the account has one, and no Order is left behind', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ ...USER, phone: null } as never);

    const res = await POST(makeReq({ tier: 'standard' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'PHONE_REQUIRED' });
    // A PENDING order nobody can pay is litter: nothing is created.
    expect(prismaMock.order.create).not.toHaveBeenCalled();
    expect(mockCheckout).not.toHaveBeenCalled();
  });

  it('takes the number from the body and saves it on the account, so it is asked once', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ ...USER, phone: null } as never);
    prismaMock.user.update.mockResolvedValueOnce({} as never);
    prismaMock.order.create.mockResolvedValueOnce({ id: 'order-1' } as never);
    mockCheckout.mockResolvedValueOnce({ token: 'tok-1', paymentUrl: 'https://payin.test/x' });
    prismaMock.order.update.mockResolvedValueOnce({} as never);

    const res = await POST(makeReq({ tier: 'pro', phone: '07 00 00 00 00' }));

    expect(res.status).toBe(201);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { phone: '0700000000' } }),
    );
    expect(mockCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '0700000000', tier: 'pro' }),
    );
  });

  it('refuses a number that cannot be one, instead of sending junk to the provider', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ ...USER, phone: null } as never);

    const res = await POST(makeReq({ tier: 'standard', phone: '12' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'PHONE_REQUIRED' });
    expect(mockCheckout).not.toHaveBeenCalled();
  });

  it('does not rewrite the account when the number has not changed', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(USER as never);
    prismaMock.order.create.mockResolvedValueOnce({ id: 'order-1' } as never);
    mockCheckout.mockResolvedValueOnce({ token: 'tok-1', paymentUrl: 'https://payin.test/x' });
    prismaMock.order.update.mockResolvedValueOnce({} as never);

    await POST(makeReq({ tier: 'standard', phone: '0700000000' }));

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
