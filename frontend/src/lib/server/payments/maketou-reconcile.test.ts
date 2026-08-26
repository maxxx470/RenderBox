import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./maketou', () => ({ maketouVerifyCart: vi.fn() }));
import { maketouVerifyCart } from './maketou';
import { reconcileMaketouOrder } from './maketou-reconcile';

const mockVerify = vi.mocked(maketouVerifyCart);

beforeEach(() => vi.clearAllMocks());

describe('reconcileMaketouOrder', () => {
  it('no-ops (no API call) on an already-settled order', async () => {
    const result = await reconcileMaketouOrder(prismaMock, {
      id: 'o1',
      status: 'PAID',
      providerChargeId: 'cart-1',
    } as never);
    expect(result).toEqual({ changed: false, status: 'PAID' });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('maps completed → PAID and sets paidAt via a CAS update', async () => {
    mockVerify.mockResolvedValueOnce({ cartId: 'cart-1', status: 'completed' });
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await reconcileMaketouOrder(prismaMock, {
      id: 'o1',
      status: 'PENDING',
      providerChargeId: 'cart-1',
    } as never);

    expect(result).toEqual({ changed: true, status: 'PAID' });
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'PAID' }),
      }),
    );
  });

  it('maps abandoned → EXPIRED and payment_failed → FAILED', async () => {
    mockVerify.mockResolvedValueOnce({ cartId: 'cart-1', status: 'abandoned' });
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 1 });
    let result = await reconcileMaketouOrder(prismaMock, {
      id: 'o1',
      status: 'PENDING',
      providerChargeId: 'cart-1',
    } as never);
    expect(result.status).toBe('EXPIRED');

    mockVerify.mockResolvedValueOnce({ cartId: 'cart-2', status: 'payment_failed' });
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 1 });
    result = await reconcileMaketouOrder(prismaMock, {
      id: 'o2',
      status: 'PENDING',
      providerChargeId: 'cart-2',
    } as never);
    expect(result.status).toBe('FAILED');
  });

  it('leaves the order untouched while still waiting_payment', async () => {
    mockVerify.mockResolvedValueOnce({ cartId: 'cart-1', status: 'waiting_payment' });
    const result = await reconcileMaketouOrder(prismaMock, {
      id: 'o1',
      status: 'PENDING',
      providerChargeId: 'cart-1',
    } as never);
    expect(result).toEqual({ changed: false, status: 'PENDING' });
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('CAS loses the race (count 0) → reports unchanged with the original status', async () => {
    mockVerify.mockResolvedValueOnce({ cartId: 'cart-1', status: 'completed' });
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await reconcileMaketouOrder(prismaMock, {
      id: 'o1',
      status: 'PENDING',
      providerChargeId: 'cart-1',
    } as never);
    expect(result).toEqual({ changed: false, status: 'PENDING' });
  });
});
