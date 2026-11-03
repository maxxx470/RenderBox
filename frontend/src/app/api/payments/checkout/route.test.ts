import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn() }));
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/payments/moneriz', async () => {
  // isMonerizEmbedSetupError and monerizCountry are pure — keep the real
  // ones, so the fallback test exercises the real classification rather than
  // a mock that would pass whatever it is told.
  const actual = await vi.importActual<typeof import('@/lib/server/payments/moneriz')>(
    '@/lib/server/payments/moneriz',
  );
  return {
    ...actual,
    monerizCheckout: vi.fn(),
    isMonerizConfigured: vi.fn(),
    getTierAmount: vi.fn(() => 15000),
  };
});

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import {
  monerizCheckout,
  isMonerizConfigured,
  MonerizApiError,
} from '@/lib/server/payments/moneriz';
import { POST } from './route';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAuth = vi.mocked(requireAuth);
const mockCheckout = vi.mocked(monerizCheckout);
const mockConfigured = vi.mocked(isMonerizConfigured);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

const SESSION = {
  sessionId: 'cs_1',
  checkoutUrl: 'https://moneriz.com/payer/cs_1',
  embedUrl: 'https://moneriz.com/integrer/tok_1',
  embedToken: 'tok_1',
  integrationMode: 'iframe',
  // Moneriz sessions last 30 minutes by default; the Order's expiry follows
  // it so the two cannot drift.
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
};

function makeReq(body: unknown = { tier: 'standard' }): NextRequest {
  return new NextRequest('http://test/api/payments/checkout', {
    method: 'POST',
    headers: { 'x-csrf-token': 'x', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function withUserAndOrder() {
  prismaMock.user.findUnique.mockResolvedValueOnce({
    id: 'user-1',
    email: 'me@example.com',
    name: 'Me',
    phone: null,
  } as never);
  prismaMock.order.create.mockResolvedValueOnce({ id: 'order-1' } as never);
  prismaMock.order.update.mockResolvedValueOnce({} as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockConfigured.mockReturnValue(true);
});

describe('POST /api/payments/checkout', () => {
  it('creates a PENDING Order, opens an iframe session, persists the session id, returns 201', async () => {
    withUserAndOrder();
    mockCheckout.mockResolvedValueOnce(SESSION);

    const res = await POST(makeReq({ tier: 'standard' }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      orderId: 'order-1',
      sessionId: 'cs_1',
      embedUrl: SESSION.embedUrl,
      embedToken: 'tok_1',
      paymentUrl: SESSION.checkoutUrl,
      amount: 15000,
      currency: 'XOF',
    });

    // The Order is ours, PENDING, in XOF, against this provider.
    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          amount: 15000,
          currency: 'XOF',
          status: 'PENDING',
          provider: 'moneriz',
          metadata: { tier: 'standard' },
        }),
      }),
    );
    // The session id is what reconcile looks the order up by, and the
    // Order's expiry follows the session's rather than our own 24 h.
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({
          providerChargeId: 'cs_1',
          expiresAt: new Date(SESSION.expiresAt),
        }),
      }),
    );
  });

  it('asks for the iframe mode and names our own origin as the embed origin', async () => {
    withUserAndOrder();
    mockCheckout.mockResolvedValueOnce(SESSION);

    await POST(makeReq());

    const input = mockCheckout.mock.calls[0]?.[0];
    expect(input?.integrationMode).toBe('iframe');
    // An exact origin, no path: Moneriz refuses anything else.
    expect(input?.embedOrigin).toBe('http://test');
    // Our Order id is both the reference and the idempotency key.
    expect(input?.reference).toBe('order-1');
  });

  it('falls back to the hosted page when Moneriz refuses the embed, instead of losing the sale', async () => {
    withUserAndOrder();
    mockCheckout
      .mockRejectedValueOnce(new MonerizApiError('nope', 400, 'EMBED_ORIGIN_NOT_ALLOWED'))
      .mockResolvedValueOnce({ ...SESSION, embedUrl: null, integrationMode: 'redirect' });

    const res = await POST(makeReq());
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.embedUrl).toBeNull();
    expect(body.paymentUrl).toBe(SESSION.checkoutUrl);
    // Second attempt, this time plainly redirected.
    expect(mockCheckout).toHaveBeenCalledTimes(2);
    expect(mockCheckout.mock.calls[1]?.[0]?.integrationMode).toBe('redirect');
    // The order was NOT failed — it is still payable.
    expect(prismaMock.order.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });

  it('does not retry a refusal that is not about the embed', async () => {
    withUserAndOrder();
    mockCheckout.mockRejectedValueOnce(new MonerizApiError('nope', 400, 'VALIDATION_ERROR'));

    await POST(makeReq());
    expect(mockCheckout).toHaveBeenCalledTimes(1);
  });

  it('fails the Order on a refusal that proves no session was created', async () => {
    withUserAndOrder();
    // A 4xx naming its own code: Moneriz created nothing, so the Order is
    // dead and can say so at once.
    mockCheckout.mockRejectedValueOnce(new MonerizApiError('nope', 400, 'VALIDATION_ERROR'));

    const res = await POST(makeReq());
    expect(res.status).toBe(502);
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });

  it('leaves the Order payable when the outcome is unknown, instead of declaring it dead', async () => {
    withUserAndOrder();
    // A network error or a timeout: a session may exist and may still be
    // paid. Failing the Order here would lie about an order being paid.
    mockCheckout.mockRejectedValueOnce(new Error('network'));

    const res = await POST(makeReq());
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe('PAYMENT_RESULT_UNKNOWN');
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('treats a Moneriz 5xx as unknown too, not as a certain refusal', async () => {
    withUserAndOrder();
    mockCheckout.mockRejectedValueOnce(new MonerizApiError('boom', 500, 'SERVER_ERROR'));

    const res = await POST(makeReq());
    expect(res.status).toBe(503);
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('503 PAYMENT_PROVIDER_UNCONFIGURED without a secret key — no Order is created', async () => {
    mockConfigured.mockReturnValue(false);

    const res = await POST(makeReq());
    expect(res.status).toBe(503);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_FAILED for an unknown tier', async () => {
    const res = await POST(makeReq({ tier: 'platine' }));
    expect(res.status).toBe(400);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('refuses without CSRF, before anything is created', async () => {
    mockVerifyCsrf.mockReturnValue(NextResponse.json({ error: 'CSRF' }, { status: 403 }));

    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('404 USER_NOT_FOUND if the authed user row is missing', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makeReq());
    expect(res.status).toBe(404);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });
});
