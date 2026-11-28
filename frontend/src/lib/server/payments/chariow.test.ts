import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/generation/tier-quota', () => ({ activateTier: vi.fn() }));
vi.mock('./moneriz-reconcile', () => ({ alertAdminsIfStockShort: vi.fn(async () => {}) }));

import {
  CHARIOW_PRODUCTS,
  activeCheckoutProvider,
  decideChariowStatus,
  isCompleteCustomer,
  parseChariowSale,
  reconcileChariowOrder,
  splitName,
  verifyChariowSignature,
  type ChariowSale,
} from './chariow';
import { activateTier } from '@/lib/server/generation/tier-quota';

const SECRET = 'whsec_test_secret';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function sale(over: Partial<ChariowSale> = {}): ChariowSale {
  return {
    id: 'sal_1',
    status: 'completed',
    amount: 6000,
    currency: 'XOF',
    productId: CHARIOW_PRODUCTS.decouverte,
    fee: null,
    ...over,
  };
}

const order = { amount: 6000, currency: 'XOF', metadata: { tier: 'decouverte' } };

describe('verifyChariowSignature', () => {
  it('accepts the HMAC of the raw body and refuses anything else', () => {
    vi.stubEnv('CHARIOW_WEBHOOK_SECRET', SECRET);
    const body = '{"event":"successful.sale","sale":{"id":"sal_1"}}';
    const sig = 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifyChariowSignature(body, sig)).toBe(true);
    expect(verifyChariowSignature(body + ' ', sig)).toBe(false);
    expect(verifyChariowSignature(body, 'sha256=' + '0'.repeat(64))).toBe(false);
    expect(verifyChariowSignature(body, null)).toBe(false);
    expect(verifyChariowSignature(body, 'nope')).toBe(false);
  });

  it('refuses everything when no secret is configured', () => {
    vi.stubEnv('CHARIOW_WEBHOOK_SECRET', '');
    const body = '{}';
    const sig = 'sha256=' + createHmac('sha256', '').update(body).digest('hex');
    expect(verifyChariowSignature(body, sig)).toBe(false);
  });
});

describe('decideChariowStatus', () => {
  it('pays a completed or settled sale of the right product and amount', () => {
    expect(decideChariowStatus(sale(), order).status).toBe('PAID');
    expect(decideChariowStatus(sale({ status: 'settled' }), order).status).toBe('PAID');
  });

  it('waits on a sale still in progress', () => {
    expect(decideChariowStatus(sale({ status: 'awaiting_payment' }), order).status).toBeNull();
    expect(decideChariowStatus(sale({ status: 'initiated' }), order).status).toBeNull();
  });

  it('maps failed and abandoned', () => {
    expect(decideChariowStatus(sale({ status: 'failed' }), order).status).toBe('FAILED');
    expect(decideChariowStatus(sale({ status: 'abandoned' }), order).status).toBe('EXPIRED');
  });

  it('refuses a cheaper amount, another currency or another product', () => {
    expect(decideChariowStatus(sale({ amount: 5000 }), order)).toEqual({
      status: null,
      blocked: 'amount_mismatch',
    });
    expect(decideChariowStatus(sale({ currency: 'USD' }), order).blocked).toBe('currency_mismatch');
    expect(decideChariowStatus(sale({ productId: CHARIOW_PRODUCTS.pro }), order).blocked).toBe(
      'product_mismatch',
    );
  });
});

describe('parseChariowSale', () => {
  it('reads the documented shape', () => {
    expect(
      parseChariowSale({
        id: 'sal_9',
        status: 'completed',
        amount: { value: 15000, formatted: '15 000 FCFA', currency: 'XOF' },
        product: { id: 'prd_qlo7a0kw' },
        payment: { fee: { value: 450, currency: 'XOF' } },
      }),
    ).toEqual({
      id: 'sal_9',
      status: 'completed',
      amount: 15000,
      currency: 'XOF',
      productId: 'prd_qlo7a0kw',
      fee: 450,
    });
    expect(parseChariowSale(null)).toBeNull();
    expect(parseChariowSale({ status: 'completed' })).toBeNull();
  });
});

describe('customer details', () => {
  it('splits a name', () => {
    expect(splitName('Max Kossi Bileda')).toEqual({ firstName: 'Max', lastName: 'Kossi Bileda' });
    expect(splitName('Max')).toEqual({ firstName: 'Max', lastName: '' });
    expect(splitName(null)).toEqual({ firstName: '', lastName: '' });
  });

  it('needs both names, a phone and a country code', () => {
    expect(
      isCompleteCustomer({ firstName: 'A', lastName: 'B', phone: '90 00 00 00', country: 'TG' }),
    ).toBe(true);
    expect(
      isCompleteCustomer({ firstName: 'A', lastName: '', phone: '90000000', country: 'TG' }),
    ).toBe(false);
    expect(isCompleteCustomer({ firstName: 'A', lastName: 'B', phone: '123', country: 'TG' })).toBe(
      false,
    );
    expect(
      isCompleteCustomer({ firstName: 'A', lastName: 'B', phone: '90000000', country: '228' }),
    ).toBe(false);
  });
});

describe('activeCheckoutProvider', () => {
  it('uses Chariow only once both keys are set, unless forced back', () => {
    vi.stubEnv('CHARIOW_API_KEY', '');
    vi.stubEnv('CHARIOW_WEBHOOK_SECRET', '');
    vi.stubEnv('PAYMENT_PROVIDER', '');
    expect(activeCheckoutProvider()).toBe('moneriz');
    vi.stubEnv('CHARIOW_API_KEY', 'sk_live_x');
    expect(activeCheckoutProvider()).toBe('moneriz');
    vi.stubEnv('CHARIOW_WEBHOOK_SECRET', SECRET);
    expect(activeCheckoutProvider()).toBe('chariow');
    vi.stubEnv('PAYMENT_PROVIDER', 'moneriz');
    expect(activeCheckoutProvider()).toBe('moneriz');
  });
});

describe('reconcileChariowOrder', () => {
  function stubSale(body: unknown) {
    vi.stubEnv('CHARIOW_API_KEY', 'sk_live_x');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: body }), { status: 200 })),
    );
  }
  const row = {
    id: 'ord_1',
    status: 'PENDING' as const,
    providerChargeId: 'sal_1',
    userId: 'u1',
    metadata: { tier: 'decouverte' },
    amount: 6000,
    currency: 'XOF',
  };

  it('credits once: only the caller that wins the compare-and-swap activates', async () => {
    stubSale({
      id: 'sal_1',
      status: 'completed',
      amount: { value: 6000, currency: 'XOF' },
      product: { id: CHARIOW_PRODUCTS.decouverte },
    });
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const prisma = { order: { updateMany } } as never;

    expect(await reconcileChariowOrder(prisma, row)).toEqual({ changed: true, status: 'PAID' });
    expect(await reconcileChariowOrder(prisma, row)).toEqual({ changed: false, status: 'PENDING' });
    expect(activateTier).toHaveBeenCalledTimes(1);
    expect(activateTier).toHaveBeenCalledWith(prisma, 'u1', 'decouverte');
  });

  it('never re-asks for a PAID order', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const prisma = { order: { updateMany: vi.fn() } } as never;
    expect(await reconcileChariowOrder(prisma, { ...row, status: 'PAID' })).toEqual({
      changed: false,
      status: 'PAID',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a negative outcome only moves a PENDING order', async () => {
    stubSale({ id: 'sal_1', status: 'failed', amount: { value: 6000, currency: 'XOF' } });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await reconcileChariowOrder({ order: { updateMany } } as never, row);
    expect(updateMany.mock.calls[0]?.[0].where).toEqual({ id: 'ord_1', status: 'PENDING' });
    expect(activateTier).not.toHaveBeenCalled();
  });
});
