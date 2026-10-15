import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn() }));
vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { POST } from './route';

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
});

describe('POST /api/admin/users/[id]/credits', () => {
  it('adds credits, logs who did it, with the reason, and returns the balance', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'u1' } as never)
      .mockResolvedValueOnce({ creditsBalance: 1500 } as never);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    const res = await POST(req({ delta: 500, reason: 'Geste commercial' }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ creditsBalance: 1500 });
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
