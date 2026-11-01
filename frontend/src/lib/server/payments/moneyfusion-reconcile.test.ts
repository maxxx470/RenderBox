// The ONE path that credits an account (2026-11-01). Everything here is about
// not giving credits away, and not giving them twice.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./moneyfusion', async () => {
  const actual = await vi.importActual<typeof import('./moneyfusion')>('./moneyfusion');
  return { ...actual, moneyfusionVerifyPayment: vi.fn() };
});
vi.mock('@/lib/server/generation/tier-quota', () => ({ activateTier: vi.fn() }));

import { moneyfusionVerifyPayment, type MoneyfusionPaymentResult } from './moneyfusion';
import { activateTier } from '@/lib/server/generation/tier-quota';
import { reconcileMoneyfusionOrder, MIN_PAID_RATIO } from './moneyfusion-reconcile';

const verify = vi.mocked(moneyfusionVerifyPayment);
const activate = vi.mocked(activateTier);

const ORDER = {
  id: 'order_42',
  status: 'PENDING',
  providerChargeId: 'tok_1',
  userId: 'user_1',
  metadata: { tier: 'standard' },
  amount: 15000,
};

function payment(over: Partial<MoneyfusionPaymentResult> = {}): MoneyfusionPaymentResult {
  return {
    token: 'tok_1',
    status: 'paid',
    amount: 15000,
    fee: 375,
    method: 'orange',
    transactionId: 'TX-9',
    orderId: 'order_42',
    ...over,
  };
}

function prismaWith(updateCount: number) {
  return {
    order: { updateMany: vi.fn().mockResolvedValue({ count: updateCount }) },
  } as unknown as Parameters<typeof reconcileMoneyfusionOrder>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a paid payment', () => {
  it('marks the order PAID and credits the plan', async () => {
    const prisma = prismaWith(1);
    verify.mockResolvedValue(payment());

    const res = await reconcileMoneyfusionOrder(prisma, ORDER);

    expect(res).toEqual({ changed: true, status: 'PAID' });
    expect(activate).toHaveBeenCalledWith(prisma, 'user_1', 'standard');
  });

  it('stores the REAL fee MoneyFusion took, and the net', async () => {
    const prisma = prismaWith(1);
    verify.mockResolvedValue(payment({ fee: 375 }));

    await reconcileMoneyfusionOrder(prisma, ORDER);

    const call = vi.mocked(prisma.order.updateMany).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
      where: Record<string, unknown>;
    };
    expect(call.data).toMatchObject({
      status: 'PAID',
      commissionAmount: 375,
      netAmount: 15000 - 375,
      paymentMethod: 'orange',
    });
    expect(call.data.paidAt).toBeInstanceOf(Date);
  });

  it('keeps the transaction reference without losing the tier in metadata', async () => {
    const prisma = prismaWith(1);
    verify.mockResolvedValue(payment());

    await reconcileMoneyfusionOrder(prisma, ORDER);

    const call = vi.mocked(prisma.order.updateMany).mock.calls[0]?.[0] as {
      data: { metadata?: Record<string, unknown> };
    };
    // The tier must survive: activateTier reads it on a later pass too.
    expect(call.data.metadata).toEqual({ tier: 'standard', moneyfusionTransaction: 'TX-9' });
  });
});

// « Credit at most once ». The CAS is `where: { status: 'PENDING' }`; the
// loser of the race updates zero rows and must not activate anything.
describe('two callers racing on the same payment', () => {
  it('only the one that won the compare-and-swap credits', async () => {
    const prisma = prismaWith(0);
    verify.mockResolvedValue(payment());

    const res = await reconcileMoneyfusionOrder(prisma, ORDER);

    expect(res).toEqual({ changed: false, status: 'PENDING' });
    expect(activate).not.toHaveBeenCalled();
  });

  it('the update is always conditional on the order still being PENDING', async () => {
    const prisma = prismaWith(1);
    verify.mockResolvedValue(payment());
    await reconcileMoneyfusionOrder(prisma, ORDER);
    const call = vi.mocked(prisma.order.updateMany).mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: 'order_42', status: 'PENDING' });
  });

  it('an already-settled order is not even looked up at the provider', async () => {
    const prisma = prismaWith(1);
    const res = await reconcileMoneyfusionOrder(prisma, { ...ORDER, status: 'PAID' });
    expect(res).toEqual({ changed: false, status: 'PAID' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('an order with no token cannot be reconciled', async () => {
    const prisma = prismaWith(1);
    const res = await reconcileMoneyfusionOrder(prisma, { ...ORDER, providerChargeId: null });
    expect(res.changed).toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('a payment that is not ours', () => {
  it('refuses to credit when personal_Info names another order', async () => {
    const prisma = prismaWith(1);
    verify.mockResolvedValue(payment({ orderId: 'someone_elses_order' }));

    const res = await reconcileMoneyfusionOrder(prisma, ORDER);

    expect(res).toEqual({ changed: false, status: 'PENDING' });
    expect(activate).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to credit a sum far below what the order asked for', async () => {
    const prisma = prismaWith(1);
    verify.mockResolvedValue(payment({ amount: 100 }));

    const res = await reconcileMoneyfusionOrder(prisma, ORDER);

    expect(res).toEqual({ changed: false, status: 'PENDING' });
    expect(activate).not.toHaveBeenCalled();
  });

  // Tolerant on purpose: were MoneyFusion to report Montant net of its fee,
  // a hard equality check would refuse every honest payment and the customer
  // would be out of pocket with nothing to show. See the module's note.
  it('credits a small shortfall rather than swallow a real payment', async () => {
    const prisma = prismaWith(1);
    verify.mockResolvedValue(payment({ amount: Math.ceil(15000 * MIN_PAID_RATIO) + 1 }));

    const res = await reconcileMoneyfusionOrder(prisma, ORDER);

    expect(res.changed).toBe(true);
    expect(activate).toHaveBeenCalled();
  });

  it('credits when MoneyFusion reports no amount at all', async () => {
    const prisma = prismaWith(1);
    verify.mockResolvedValue(payment({ amount: null, orderId: null }));
    const res = await reconcileMoneyfusionOrder(prisma, ORDER);
    expect(res.changed).toBe(true);
  });

  // An older order made at a previous price must still complete: we compare
  // against what the ORDER recorded, never against the tier's price today.
  it('settles an order whose amount is no longer the tier’s price', async () => {
    const prisma = prismaWith(1);
    const old = { ...ORDER, amount: 9000 };
    verify.mockResolvedValue(payment({ amount: 9000 }));
    const res = await reconcileMoneyfusionOrder(prisma, old);
    expect(res.changed).toBe(true);
    expect(activate).toHaveBeenCalledWith(prisma, 'user_1', 'standard');
  });
});

describe('the states that are not a payment', () => {
  it('maps failure to FAILED without crediting', async () => {
    const prisma = prismaWith(1);
    verify.mockResolvedValue(payment({ status: 'failure' }));

    const res = await reconcileMoneyfusionOrder(prisma, ORDER);

    expect(res).toEqual({ changed: true, status: 'FAILED' });
    expect(activate).not.toHaveBeenCalled();
    const call = vi.mocked(prisma.order.updateMany).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.paidAt).toBeUndefined();
    // No fee is booked on a payment that never happened.
    expect(call.data.commissionAmount).toBeUndefined();
  });

  it.each([['pending'], ['no paid']] as const)(
    'leaves the order PENDING on %s, so the customer can still finish',
    async (status) => {
      const prisma = prismaWith(1);
      verify.mockResolvedValue(payment({ status }));

      const res = await reconcileMoneyfusionOrder(prisma, ORDER);

      expect(res).toEqual({ changed: false, status: 'PENDING' });
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(activate).not.toHaveBeenCalled();
    },
  );
});

describe('an order with no tier and no user', () => {
  it('settles the order but credits nothing it cannot attribute', async () => {
    const prisma = prismaWith(1);
    verify.mockResolvedValue(payment());
    const res = await reconcileMoneyfusionOrder(prisma, { ...ORDER, metadata: {} });
    expect(res.changed).toBe(true);
    expect(activate).not.toHaveBeenCalled();
  });

  it('does not credit a guest order', async () => {
    const prisma = prismaWith(1);
    verify.mockResolvedValue(payment());
    await reconcileMoneyfusionOrder(prisma, { ...ORDER, userId: null });
    expect(activate).not.toHaveBeenCalled();
  });
});
