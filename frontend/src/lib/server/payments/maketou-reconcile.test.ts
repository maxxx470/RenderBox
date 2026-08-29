import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./maketou', () => ({ maketouVerifyCart: vi.fn() }));
vi.mock('@/lib/server/generation/tier-quota', () => ({ activateTier: vi.fn() }));
import { maketouVerifyCart } from './maketou';
import { activateTier } from '@/lib/server/generation/tier-quota';
import { reconcileMaketouOrder } from './maketou-reconcile';

const mockVerify = vi.mocked(maketouVerifyCart);
const mockActivateTier = vi.mocked(activateTier);

beforeEach(() => vi.clearAllMocks());

describe('reconcileMaketouOrder', () => {
  it('no-ops (no API call) on an already-settled order', async () => {
    const result = await reconcileMaketouOrder(prismaMock, {
      id: 'o1',
      status: 'PAID',
      providerChargeId: 'cart-1',
      userId: 'user-1',
      metadata: { tier: 'standard' },
    } as never);
    expect(result).toEqual({ changed: false, status: 'PAID' });
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockActivateTier).not.toHaveBeenCalled();
  });

  it('maps completed → PAID, sets paidAt via a CAS update, and activates the order tier', async () => {
    mockVerify.mockResolvedValueOnce({ cartId: 'cart-1', status: 'completed' });
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await reconcileMaketouOrder(prismaMock, {
      id: 'o1',
      status: 'PENDING',
      providerChargeId: 'cart-1',
      userId: 'user-1',
      metadata: { tier: 'pro' },
    } as never);

    expect(result).toEqual({ changed: true, status: 'PAID' });
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'PAID' }),
      }),
    );
    expect(mockActivateTier).toHaveBeenCalledWith(prismaMock, 'user-1', 'pro');
  });

  it('does not activate a tier when the order has no userId (guest checkout)', async () => {
    mockVerify.mockResolvedValueOnce({ cartId: 'cart-1', status: 'completed' });
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 1 });

    await reconcileMaketouOrder(prismaMock, {
      id: 'o1',
      status: 'PENDING',
      providerChargeId: 'cart-1',
      userId: null,
      metadata: { tier: 'pro' },
    } as never);

    expect(mockActivateTier).not.toHaveBeenCalled();
  });

  it('does not activate a tier when metadata has no recognizable tier', async () => {
    mockVerify.mockResolvedValueOnce({ cartId: 'cart-1', status: 'completed' });
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 1 });

    await reconcileMaketouOrder(prismaMock, {
      id: 'o1',
      status: 'PENDING',
      providerChargeId: 'cart-1',
      userId: 'user-1',
      metadata: null,
    } as never);

    expect(mockActivateTier).not.toHaveBeenCalled();
  });

  it('maps abandoned → EXPIRED and payment_failed → FAILED, without activating a tier', async () => {
    mockVerify.mockResolvedValueOnce({ cartId: 'cart-1', status: 'abandoned' });
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 1 });
    let result = await reconcileMaketouOrder(prismaMock, {
      id: 'o1',
      status: 'PENDING',
      providerChargeId: 'cart-1',
      userId: 'user-1',
      metadata: { tier: 'standard' },
    } as never);
    expect(result.status).toBe('EXPIRED');

    mockVerify.mockResolvedValueOnce({ cartId: 'cart-2', status: 'payment_failed' });
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 1 });
    result = await reconcileMaketouOrder(prismaMock, {
      id: 'o2',
      status: 'PENDING',
      providerChargeId: 'cart-2',
      userId: 'user-1',
      metadata: { tier: 'standard' },
    } as never);
    expect(result.status).toBe('FAILED');
    expect(mockActivateTier).not.toHaveBeenCalled();
  });

  it('leaves the order untouched while still waiting_payment', async () => {
    mockVerify.mockResolvedValueOnce({ cartId: 'cart-1', status: 'waiting_payment' });
    const result = await reconcileMaketouOrder(prismaMock, {
      id: 'o1',
      status: 'PENDING',
      providerChargeId: 'cart-1',
      userId: 'user-1',
      metadata: { tier: 'standard' },
    } as never);
    expect(result).toEqual({ changed: false, status: 'PENDING' });
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('CAS loses the race (count 0) → reports unchanged and never activates a tier', async () => {
    mockVerify.mockResolvedValueOnce({ cartId: 'cart-1', status: 'completed' });
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await reconcileMaketouOrder(prismaMock, {
      id: 'o1',
      status: 'PENDING',
      providerChargeId: 'cart-1',
      userId: 'user-1',
      metadata: { tier: 'standard' },
    } as never);
    expect(result).toEqual({ changed: false, status: 'PENDING' });
    expect(mockActivateTier).not.toHaveBeenCalled();
  });
});
