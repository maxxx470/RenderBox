import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { seedAdmin } from '@/test-utils/admin-fixtures';
import { GET } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const admin = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/admin/stats');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/stats', () => {
  it('returns the four overview numbers', async () => {
    prismaMock.user.count.mockResolvedValueOnce(124).mockResolvedValueOnce(4);
    prismaMock.renderNode.count.mockResolvedValueOnce(3402);
    prismaMock.order.aggregate.mockResolvedValueOnce({ _sum: { amount: 412000 } } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      activeAccounts: 124,
      suspendedAccounts: 4,
      generationsThisMonth: 3402,
      maketouRevenueXof: 412000,
    });
  });

  it('defaults revenue to 0 when there are no PAID orders yet', async () => {
    prismaMock.user.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prismaMock.renderNode.count.mockResolvedValueOnce(0);
    prismaMock.order.aggregate.mockResolvedValueOnce({ _sum: { amount: null } } as never);

    const res = await GET(makeReq());
    const body = (await res.json()) as { maketouRevenueXof: number };
    expect(body.maketouRevenueXof).toBe(0);
  });

  it('propagates 403 from requireAdmin without hitting the DB', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });
});
