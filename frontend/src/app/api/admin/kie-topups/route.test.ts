import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';

const mockRequireAdmin = vi.fn();
vi.mock('@/lib/server/middleware', () => ({ requireAdmin: () => mockRequireAdmin() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: () => null }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: async () => null,
}));
const mockLog = vi.fn();
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: (...args: unknown[]) => mockLog(...args),
}));

import { POST } from './route';

const call = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/admin/kie-topups', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );

describe('POST /api/admin/kie-topups', () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset().mockResolvedValue({ admin: { id: 'a1' } });
    mockLog.mockReset();
    prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) =>
      fn(prismaMock)) as never);
    prismaMock.kieTopUp.create.mockResolvedValue({
      id: 't1',
      createdAt: new Date('2026-10-22T12:00:00Z'),
    } as never);
  });

  it('records a top-up and audits it — it changes no balance', async () => {
    const res = await call({ amountUsd: 5, credits: 1000, note: 'carte' });
    expect(res.status).toBe(201);
    expect(prismaMock.kieTopUp.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { amountUsd: 5, credits: 1000, note: 'carte', adminId: 'a1' },
      }),
    );
    expect(mockLog).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ action: 'kie.topup', actorId: 'a1', targetId: 't1' }),
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a zero or negative amount', async () => {
    expect((await call({ amountUsd: 0, credits: 1000 })).status).toBe(400);
    expect((await call({ amountUsd: 5, credits: -1 })).status).toBe(400);
    expect(prismaMock.kieTopUp.create).not.toHaveBeenCalled();
  });

  it('is for admins only', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }));
    expect((await call({ amountUsd: 5, credits: 1000 })).status).toBe(403);
    expect(prismaMock.kieTopUp.create).not.toHaveBeenCalled();
  });
});
