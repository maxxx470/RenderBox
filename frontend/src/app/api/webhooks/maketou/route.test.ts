import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/payments/maketou-webhook', () => ({ verifyMaketouSignature: vi.fn() }));
vi.mock('@/lib/server/payments/maketou-reconcile', () => ({ reconcileMaketouOrder: vi.fn() }));
vi.mock('@/lib/server/payments/maketou', () => ({ isMaketouApiConfigured: vi.fn(() => true) }));

import { verifyMaketouSignature } from '@/lib/server/payments/maketou-webhook';
import { reconcileMaketouOrder } from '@/lib/server/payments/maketou-reconcile';
import { POST } from './route';

const mockVerify = vi.mocked(verifyMaketouSignature);
const mockReconcile = vi.mocked(reconcileMaketouOrder);

const ORDER = {
  id: 'order-1',
  status: 'PENDING',
  providerChargeId: 'cart-1',
  userId: 'user-1',
  metadata: { tier: 'standard' },
};

function makeReq(body: unknown = { id: 'cart-1', status: 'completed' }): NextRequest {
  return new NextRequest('http://test/api/webhooks/maketou', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cart-signature': 't=1,v1=x' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerify.mockReturnValue(true);
});

describe('POST /api/webhooks/maketou', () => {
  it('re-verifies the cart through the shared reconcile path', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce(ORDER as never);
    mockReconcile.mockResolvedValueOnce({ changed: true, status: 'PAID' });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockReconcile).toHaveBeenCalledWith(expect.anything(), ORDER);
    expect(prismaMock.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { provider: 'maketou', providerChargeId: 'cart-1' } }),
    );
  });

  it('refuses a bad signature with 401 and touches nothing', async () => {
    mockVerify.mockReturnValue(false);
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(prismaMock.order.findFirst).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('acknowledges an unknown cart with 200 so Maketou stops retrying', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce(null);
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('answers 503 when the API check fails, so Maketou retries', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce(ORDER as never);
    mockReconcile.mockRejectedValueOnce(new Error('maketou down'));
    const res = await POST(makeReq());
    expect(res.status).toBe(503);
  });

  it('refuses a body that is not a JSON object', async () => {
    const res = await POST(makeReq([1, 2]));
    expect(res.status).toBe(400);
  });
});
