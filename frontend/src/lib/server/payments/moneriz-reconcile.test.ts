import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prismaMock } from '@/test-utils/prisma-mock';

const { mockVerify, mockActivate } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockActivate: vi.fn(),
}));

vi.mock('./moneriz', async () => {
  const actual = await vi.importActual<typeof import('./moneriz')>('./moneriz');
  return { ...actual, monerizVerifySession: mockVerify };
});
vi.mock('@/lib/server/generation/tier-quota', () => ({ activateTier: mockActivate }));

import { decideOrderStatus, monerizFeeSplit, reconcileMonerizOrder } from './moneriz-reconcile';
import type { MonerizSessionResult } from './moneriz';

const ORDER = {
  id: 'order-1',
  status: 'PENDING',
  providerChargeId: 'cs_1',
  userId: 'user-1',
  metadata: { tier: 'standard' },
  amount: 15000,
  currency: 'XOF',
} as const;

function session(over: Partial<MonerizSessionResult> = {}): MonerizSessionResult {
  return {
    sessionId: 'cs_1',
    mode: 'live',
    paymentStatus: 'paid',
    sessionStatus: 'complete',
    confirmation: 'confirmed',
    amount: 15000,
    currency: 'XOF',
    reference: 'order-1',
    paymentId: 'pay_1',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MONERIZ_SECRET_KEY = 'izp_live_sk_test';
  delete process.env.MONERIZ_ALLOW_TEST_MODE;
  prismaMock.order.updateMany.mockResolvedValue({ count: 1 } as never);
});
afterEach(() => {
  delete process.env.MONERIZ_SECRET_KEY;
  delete process.env.MONERIZ_ALLOW_TEST_MODE;
});

describe('decideOrderStatus — every refusal, with no database', () => {
  it('pays only on paid AND confirmed', () => {
    expect(decideOrderStatus(session(), ORDER).status).toBe('PAID');
  });

  it('a paid session that is not yet confirmed stays PENDING', () => {
    // `authorized` means the funds are held, not captured. `review` means a
    // human is still looking. Neither is money we have.
    for (const confirmation of ['pending', 'authorized', 'review'] as const) {
      const d = decideOrderStatus(session({ confirmation }), ORDER);
      expect(d.status).toBeNull();
      expect(d.blocked).toBe('awaiting_confirmation');
    }
  });

  it('maps the terminal statuses', () => {
    expect(decideOrderStatus(session({ paymentStatus: 'pending' }), ORDER).status).toBeNull();
    expect(decideOrderStatus(session({ paymentStatus: 'failed' }), ORDER).status).toBe('FAILED');
    expect(decideOrderStatus(session({ paymentStatus: 'expired' }), ORDER).status).toBe('EXPIRED');
    expect(decideOrderStatus(session({ paymentStatus: 'reversed' }), ORDER).status).toBe(
      'REFUNDED',
    );
  });

  it('refuses a session settled for LESS than the plan costs', () => {
    const d = decideOrderStatus(session({ amount: 14999 }), ORDER);
    expect(d.status).toBeNull();
    expect(d.blocked).toBe('amount_mismatch');
  });

  it('accepts more than asked — overpaying is not a reason to refuse a plan', () => {
    expect(decideOrderStatus(session({ amount: 15001 }), ORDER).status).toBe('PAID');
  });

  it('refuses another currency', () => {
    const d = decideOrderStatus(session({ currency: 'XAF' }), ORDER);
    expect(d.status).toBeNull();
    expect(d.blocked).toBe('currency_mismatch');
  });

  it('a TEST session cannot buy a real plan', () => {
    // The scenario this guards: a test key deployed to production would
    // otherwise make every "payment" free.
    const d = decideOrderStatus(session({ mode: 'test' }), ORDER);
    expect(d.status).toBeNull();
    expect(d.blocked).toBe('test_mode');
  });

  it('…unless MONERIZ_ALLOW_TEST_MODE is set, for local work', () => {
    process.env.MONERIZ_ALLOW_TEST_MODE = '1';
    process.env.MONERIZ_SECRET_KEY = 'izp_test_sk_x';
    expect(decideOrderStatus(session({ mode: 'test' }), ORDER).status).toBe('PAID');
  });

  it('a live key must not settle a test session, nor the reverse', () => {
    process.env.MONERIZ_ALLOW_TEST_MODE = '1';
    process.env.MONERIZ_SECRET_KEY = 'izp_live_sk_x';
    expect(decideOrderStatus(session({ mode: 'test' }), ORDER).blocked).toBe('test_mode');
    process.env.MONERIZ_SECRET_KEY = 'izp_test_sk_x';
    expect(decideOrderStatus(session({ mode: 'live' }), ORDER).blocked).toBe('test_mode');
  });

  it('a `complete` SESSION with no payment status credits nothing', () => {
    // The two vocabularies are different: `complete` describes the session,
    // not the money. Reading it as « paid » would credit an account on a
    // session that finished without a payment.
    expect(
      decideOrderStatus(session({ paymentStatus: null, sessionStatus: 'complete' }), ORDER).status,
    ).toBeNull();
  });

  it('a session that can never be paid is recorded, without a payment status', () => {
    expect(
      decideOrderStatus(session({ paymentStatus: null, sessionStatus: 'expired' }), ORDER).status,
    ).toBe('EXPIRED');
    expect(
      decideOrderStatus(session({ paymentStatus: null, sessionStatus: 'disabled' }), ORDER).status,
    ).toBe('EXPIRED');
    expect(
      decideOrderStatus(session({ paymentStatus: null, sessionStatus: 'reversed' }), ORDER).status,
    ).toBe('REFUNDED');
    // Still open, or in flight: nothing to write.
    expect(
      decideOrderStatus(session({ paymentStatus: null, sessionStatus: 'open' }), ORDER).status,
    ).toBeNull();
    expect(
      decideOrderStatus(session({ paymentStatus: null, sessionStatus: 'processing' }), ORDER)
        .status,
    ).toBeNull();
  });

  it('a session that reports no mode or no amount is still settled', () => {
    // Absent is not the same as wrong: refusing on a field Moneriz simply
    // did not send would strand a real payment.
    expect(decideOrderStatus(session({ mode: null, amount: null }), ORDER).status).toBe('PAID');
  });
});

describe('monerizFeeSplit', () => {
  it("takes Moneriz's 5 %, rounded down, from the amount settled", () => {
    expect(monerizFeeSplit(6000)).toEqual({ commission: 300, net: 5700 });
    expect(monerizFeeSplit(15000)).toEqual({ commission: 750, net: 14250 });
    expect(monerizFeeSplit(36000)).toEqual({ commission: 1800, net: 34200 });
    // Rounded down, and the two parts always sum back to the whole.
    const { commission, net } = monerizFeeSplit(1999);
    expect(commission).toBe(99);
    expect(commission + net).toBe(1999);
  });
});

describe('reconcileMonerizOrder', () => {
  it('settles, books the real fee, and activates the tier exactly once', async () => {
    mockVerify.mockResolvedValueOnce(session());

    const res = await reconcileMonerizOrder(prismaMock, { ...ORDER });
    expect(res).toMatchObject({ changed: true, status: 'PAID' });
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // The compare-and-swap. A success may settle an order that expired
        // or failed earlier, because Moneriz confirms late; only one caller
        // can win the update either way.
        where: { id: 'order-1', status: { in: ['PENDING', 'EXPIRED', 'FAILED'] } },
        data: expect.objectContaining({
          status: 'PAID',
          commissionAmount: 750,
          netAmount: 14250,
        }),
      }),
    );
    expect(mockActivate).toHaveBeenCalledTimes(1);
    expect(mockActivate).toHaveBeenCalledWith(prismaMock, 'user-1', 'standard');
  });

  it('a broken stock alert never costs the customer their plan', async () => {
    // The alert reads Kie and writes notifications AFTER the activation.
    // If any of that throws -- Kie down, a notification insert failing --
    // the sale must still stand: the customer has paid and been credited,
    // and turning that into a 500 would be the worst outcome of all.
    mockVerify.mockResolvedValueOnce(session());
    const boom = new Error('kie is down');
    prismaMock.user.aggregate.mockRejectedValueOnce(boom);

    const res = await reconcileMonerizOrder(prismaMock, { ...ORDER });

    expect(res).toMatchObject({ changed: true, status: 'PAID' });
    expect(mockActivate).toHaveBeenCalledTimes(1);
  });

  it('the loser of the race never double-activates', async () => {
    // Two callers (the webhook and the return page) on the same session: the
    // second UPDATE matches zero rows.
    mockVerify.mockResolvedValueOnce(session());
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 0 } as never);

    const res = await reconcileMonerizOrder(prismaMock, { ...ORDER });
    expect(res.changed).toBe(false);
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it('books no fee on a payment that did not settle', async () => {
    mockVerify.mockResolvedValueOnce(session({ paymentStatus: 'failed' }));

    await reconcileMonerizOrder(prismaMock, { ...ORDER });
    const data = prismaMock.order.updateMany.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBe('FAILED');
    expect(data.commissionAmount).toBeUndefined();
    expect(data.paidAt).toBeUndefined();
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it('a reversed payment settles as REFUNDED and grants nothing', async () => {
    mockVerify.mockResolvedValueOnce(session({ paymentStatus: 'reversed' }));

    const res = await reconcileMonerizOrder(prismaMock, { ...ORDER });
    expect(res.status).toBe('REFUNDED');
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it('writes nothing at all while the payment is unconfirmed', async () => {
    mockVerify.mockResolvedValueOnce(session({ confirmation: 'review' }));

    const res = await reconcileMonerizOrder(prismaMock, { ...ORDER });
    expect(res).toMatchObject({
      changed: false,
      status: 'PENDING',
      blocked: 'awaiting_confirmation',
    });
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it('never calls the API for an order that is already settled', async () => {
    for (const status of ['PAID', 'REFUNDED']) {
      const res = await reconcileMonerizOrder(prismaMock, { ...ORDER, status });
      expect(res).toEqual({ changed: false, status });
    }
    expect(mockVerify).not.toHaveBeenCalled();
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  // Moneriz confirms late: « une réussite tardive reste possible » after
  // payment.expired, and a failed attempt can be retried in the same open
  // session. Stopping at « not PENDING any more » would take the money and
  // never open the plan.
  it('a LATE success still settles an order that expired or failed', async () => {
    for (const previous of ['EXPIRED', 'FAILED']) {
      vi.clearAllMocks();
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 } as never);
      mockVerify.mockResolvedValueOnce(session());

      const res = await reconcileMonerizOrder(prismaMock, { ...ORDER, status: previous });
      expect(res).toMatchObject({ changed: true, status: 'PAID' });
      // The guard admits exactly the three unsettled statuses, and is still
      // a compare-and-swap.
      const where = prismaMock.order.updateMany.mock.calls[0]?.[0]?.where as Record<
        string,
        unknown
      >;
      expect(where.status).toEqual({ in: ['PENDING', 'EXPIRED', 'FAILED'] });
      expect(mockActivate).toHaveBeenCalledTimes(1);
    }
  });

  it('a stale negative event can NEVER undo a settled sale', async () => {
    // Events arrive out of order. An `expired` landing after a confirmation
    // must not downgrade the order, so the negative transition is guarded on
    // PENDING alone — a PAID row simply does not match.
    mockVerify.mockResolvedValueOnce(session({ paymentStatus: 'expired' }));
    await reconcileMonerizOrder(prismaMock, { ...ORDER, status: 'PENDING' });
    const where = prismaMock.order.updateMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.status).toBe('PENDING');
  });

  it('writes nothing when the provider only confirms where we already are', async () => {
    mockVerify.mockResolvedValueOnce(session({ paymentStatus: 'failed' }));
    const res = await reconcileMonerizOrder(prismaMock, { ...ORDER, status: 'FAILED' });
    expect(res).toEqual({ changed: false, status: 'FAILED' });
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing for an order that never got a session id', async () => {
    const res = await reconcileMonerizOrder(prismaMock, { ...ORDER, providerChargeId: null });
    expect(res).toEqual({ changed: false, status: 'PENDING' });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('a guest order settles without an activation to run', async () => {
    mockVerify.mockResolvedValueOnce(session());
    const res = await reconcileMonerizOrder(prismaMock, { ...ORDER, userId: null });
    expect(res.status).toBe('PAID');
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it('settles without activating when the order names no known tier', async () => {
    mockVerify.mockResolvedValueOnce(session());
    const res = await reconcileMonerizOrder(prismaMock, {
      ...ORDER,
      metadata: { tier: 'platine' },
    });
    expect(res.status).toBe('PAID');
    expect(mockActivate).not.toHaveBeenCalled();
  });
});
