// Phase 6 — soft-delete (DELETE /api/admin/users/[id]) + restore
// (POST /api/admin/users/[id]/restore). Mirrors the mocking conventions
// from the sibling `route.test.ts` (GET) — no prior test file existed for
// the $transaction-based mutations (status/role routes), so this
// establishes the `$transaction.mockImplementation((cb) => cb(prismaMock))`
// pattern for both.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn() }));
vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
  requireSuperadmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin, requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { DELETE } from './route';
import { POST as RESTORE } from './restore/route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const admin = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};
const superadminCtx = {
  user: { sub: 'sa_1', email: 'sa@test.local' },
  admin: { id: 'sa_1', email: 'sa@test.local', role: 'SUPERADMIN' as const },
};

function makeReq(method: string): NextRequest {
  return new NextRequest('http://test/api/admin/users/u1', { method });
}
function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.$transaction.mockImplementation(((cb: unknown) =>
    (cb as (tx: typeof prismaMock) => unknown)(prismaMock)) as never);
});

describe('DELETE /api/admin/users/[id] (soft-delete)', () => {
  it('sets deletedAt and writes an AdminAction for an active USER', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      role: 'USER',
      deletedAt: null,
    } as never);
    prismaMock.user.update.mockResolvedValueOnce({
      id: 'u1',
      deletedAt: new Date('2026-08-26T00:00:00Z'),
    } as never);

    const res = await DELETE(makeReq('DELETE'), ctxWith('u1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { deletedAt: string } };
    expect(body.user.deletedAt).toBeTruthy();
    expect(logAdminAction).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ action: 'user.soft_delete', targetId: 'u1' }),
    );
  });

  it('is idempotent: already-deleted user returns 200 without a new AdminAction', async () => {
    const already = new Date('2026-01-01T00:00:00Z');
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      role: 'USER',
      deletedAt: already,
    } as never);

    const res = await DELETE(makeReq('DELETE'), ctxWith('u1'));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('404 USER_NOT_FOUND for a missing user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    const res = await DELETE(makeReq('DELETE'), ctxWith('missing'));
    expect(res.status).toBe(404);
  });

  it('409 LAST_SUPERADMIN refuses to delete the sole remaining SUPERADMIN', async () => {
    mockRequireAdmin.mockResolvedValueOnce(superadminCtx);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      role: 'SUPERADMIN',
      deletedAt: null,
    } as never);
    prismaMock.user.count.mockResolvedValueOnce(1);

    const res = await DELETE(makeReq('DELETE'), ctxWith('u1'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('LAST_SUPERADMIN');
  });

  it('403 DELETE_REQUIRES_SUPERADMIN when an ADMIN targets a SUPERADMIN', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      role: 'SUPERADMIN',
      deletedAt: null,
    } as never);

    const res = await DELETE(makeReq('DELETE'), ctxWith('u1'));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('DELETE_REQUIRES_SUPERADMIN');
  });

  it('propagates CSRF failure without touching the DB', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await DELETE(makeReq('DELETE'), ctxWith('u1'));
    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/users/[id]/restore', () => {
  it('clears deletedAt and writes an AdminAction (SUPERADMIN)', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      deletedAt: new Date('2026-01-01T00:00:00Z'),
    } as never);
    prismaMock.user.update.mockResolvedValueOnce({ id: 'u1', deletedAt: null } as never);

    const res = await RESTORE(makeReq('POST'), ctxWith('u1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { deletedAt: null } };
    expect(body.user.deletedAt).toBeNull();
    expect(logAdminAction).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ action: 'user.restore_deleted', targetId: 'u1' }),
    );
  });

  it('is idempotent: an already-active user returns 200 without a new AdminAction', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1', deletedAt: null } as never);
    const res = await RESTORE(makeReq('POST'), ctxWith('u1'));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('404 USER_NOT_FOUND for a missing user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    const res = await RESTORE(makeReq('POST'), ctxWith('missing'));
    expect(res.status).toBe(404);
  });

  it('propagates 403 from requireSuperadmin (ADMIN cannot restore)', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await RESTORE(makeReq('POST'), ctxWith('u1'));
    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
