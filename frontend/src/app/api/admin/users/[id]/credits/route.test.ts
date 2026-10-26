import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn() }));
vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/generation/engines/kie', () => ({
  getKieBalance: vi.fn(),
  isKieConfigured: vi.fn(),
}));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { getKieBalance, isKieConfigured } from '@/lib/server/generation/engines/kie';
import { POST } from './route';

/** Kie's balance, and what the accounts already hold. */
const stock = (balance: number | null, circulation: number) => {
  vi.mocked(isKieConfigured).mockReturnValue(true);
  if (balance === null) vi.mocked(getKieBalance).mockRejectedValue(new Error('no answer'));
  else vi.mocked(getKieBalance).mockResolvedValue(balance);
  prismaMock.user.aggregate.mockResolvedValue({
    _sum: { creditsBalance: circulation },
  } as never);
};

const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const },
};
const req = (body: unknown) =>
  new NextRequest('http://test/api/admin/users/u1/credits', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ id: 'u1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyCsrf).mockReturnValue(null);
  vi.mocked(requireAdmin).mockResolvedValue(adminCtx);
  vi.mocked(enforceAdminRateLimit).mockResolvedValue(null);
  prismaMock.$transaction.mockImplementation(((cb: unknown) =>
    (cb as (tx: typeof prismaMock) => unknown)(prismaMock)) as never);
  // No Kie account by default: the old tests know nothing of the stock.
  vi.mocked(isKieConfigured).mockReturnValue(false);
  vi.mocked(getKieBalance).mockResolvedValue(null);
});

describe('POST /api/admin/users/[id]/credits', () => {
  it('adds credits, logs who did it, with the reason, and returns the balance', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'u1' } as never)
      .mockResolvedValueOnce({ creditsBalance: 1500 } as never);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    const res = await POST(req({ delta: 500, reason: 'Geste commercial' }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ creditsBalance: 1500, room: null });
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { creditsBalance: { increment: 500 } },
    });
    expect(logAdminAction).toHaveBeenCalledWith(prismaMock, {
      actorId: 'admin_1',
      action: 'user.credits_adjust',
      targetType: 'User',
      targetId: 'u1',
      metadata: { delta: 500, reason: 'Geste commercial', creditsBalance: 1500 },
    });
  });

  it('never takes the balance below zero: 409, nothing logged', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1' } as never);
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });
    const res = await POST(req({ delta: -200, reason: 'Correction' }), params);
    expect(res.status).toBe(409);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', creditsBalance: { gte: 200 } },
      data: { creditsBalance: { increment: -200 } },
    });
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('refuses zero, decimals and a missing reason', async () => {
    for (const body of [
      { delta: 0, reason: 'xxx' },
      { delta: 1.5, reason: 'xxx' },
      { delta: 10, reason: '' },
    ]) {
      const res = await POST(req(body), params);
      expect(res.status).toBe(400);
    }
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('404 for an unknown user; 403 passes through from requireAdmin', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    expect((await POST(req({ delta: 5, reason: 'abc' }), params)).status).toBe(404);
    vi.mocked(requireAdmin).mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    expect((await POST(req({ delta: 5, reason: 'abc' }), params)).status).toBe(403);
  });
});

// The Kie stock frames the two directions (2026-10-26, owner).
describe('the stock a gift has to fit in', () => {
  it('lets a gift through when the stock has the room, and says what is left', async () => {
    stock(10_000, 7_000);
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'u1' } as never)
      .mockResolvedValueOnce({ creditsBalance: 2_500 } as never);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    // 7 000 held, 2 000 given: 9 000 held afterwards against 10 000 at Kie.
    prismaMock.user.aggregate
      .mockResolvedValueOnce({ _sum: { creditsBalance: 7_000 } } as never)
      .mockResolvedValueOnce({ _sum: { creditsBalance: 9_000 } } as never);
    const res = await POST(req({ delta: 2_000, reason: 'Geste commercial' }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ creditsBalance: 2_500, room: 1_000 });
  });

  it('refuses a gift the stock does not cover, and nothing is written', async () => {
    stock(10_000, 9_500);
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1' } as never);
    const res = await POST(req({ delta: 2_000, reason: 'Geste commercial' }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'STOCK_TOO_LOW',
      requested: 2_000,
      room: 500,
      balance: 10_000,
      circulation: 9_500,
    });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('waits rather than guessing when Kie does not answer', async () => {
    stock(null, 1_000);
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1' } as never);
    const res = await POST(req({ delta: 10, reason: 'Geste commercial' }), params);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'STOCK_UNKNOWN' });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('a removal never asks Kie: the credits come back into the stock', async () => {
    vi.mocked(isKieConfigured).mockReturnValue(true);
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'u1' } as never)
      .mockResolvedValueOnce({ creditsBalance: 300 } as never);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    const res = await POST(req({ delta: -200, reason: 'Correction' }), params);
    expect(res.status).toBe(200);
    expect(getKieBalance).not.toHaveBeenCalled();
    expect(prismaMock.user.aggregate).not.toHaveBeenCalled();
  });
});
