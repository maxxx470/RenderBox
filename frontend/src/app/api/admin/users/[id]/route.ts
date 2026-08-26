// ADMIN-01 — GET /api/admin/users/[id] (detail); Phase 6 — DELETE (soft-delete).
//
// GET sequence: makeRequestContext → withRequestContext → requireAdmin('ADMIN')
// → enforceAdminRateLimit → prisma.user.findUnique with the same PII-safe
// USER_SELECT shape as the list endpoint. 404 on miss with stable code
// USER_NOT_FOUND.
//
// DELETE is a reversible soft-delete (sets User.deletedAt), NOT a real row
// delete — see lib/server/users/soft-delete.ts for the hard-delete purge
// cron. Idempotent (re-DELETE on an already-deleted user is a no-op, no
// duplicate AdminAction row, mirroring the status route's same-value
// no-op). Mirrors user.role_change's last-SUPERADMIN guard: refusing to
// delete the last SUPERADMIN would otherwise lock the back-office out.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  deletedAt: true,
} as const satisfies Prisma.UserSelect;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    // Phase 6 — the detail page needs a drill-down into this user's
    // projects/generations/payments. A single user's history is small
    // enough to embed directly (no separate pagination endpoint needed).
    const [projectsRaw, ordersRaw] = await Promise.all([
      prisma.project.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: { select: { renderNodes: true } },
        },
      }),
      prisma.order.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, amount: true, currency: true, status: true, createdAt: true },
      }),
    ]);
    const projects = projectsRaw ?? [];
    const orders = ordersRaw ?? [];

    return NextResponse.json(
      {
        user,
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          createdAt: p.createdAt,
          generationsCount: p._count.renderNodes,
        })),
        orders,
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

type DeleteDiscriminator =
  | { kind: 'NOT_FOUND' }
  | { kind: 'LAST_SUPERADMIN' }
  | { kind: 'DELETE_REQUIRES_SUPERADMIN' }
  | { kind: 'OK'; user: { id: string; deletedAt: Date | null } };

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;

    const result: DeleteDiscriminator = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id },
        select: { id: true, role: true, deletedAt: true },
      });
      if (!target) return { kind: 'NOT_FOUND' as const };

      // Idempotent no-op: already deleted → return without writing AdminAction.
      if (target.deletedAt) {
        return { kind: 'OK' as const, user: { id: target.id, deletedAt: target.deletedAt } };
      }

      if (target.role === 'SUPERADMIN' && auth.admin.role !== 'SUPERADMIN') {
        return { kind: 'DELETE_REQUIRES_SUPERADMIN' as const };
      }
      if (target.role === 'SUPERADMIN') {
        const superadminCount = await tx.user.count({
          where: { role: 'SUPERADMIN', deletedAt: null },
        });
        if (superadminCount <= 1) return { kind: 'LAST_SUPERADMIN' as const };
      }

      const updated = await tx.user.update({
        where: { id },
        data: { deletedAt: new Date() },
        select: { id: true, deletedAt: true },
      });

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'user.soft_delete',
        targetType: 'User',
        targetId: id,
      });

      return { kind: 'OK' as const, user: updated };
    });

    if (result.kind === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (result.kind === 'LAST_SUPERADMIN') {
      return NextResponse.json(
        { error: 'LAST_SUPERADMIN', message: 'Refuse to delete the last SUPERADMIN.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (result.kind === 'DELETE_REQUIRES_SUPERADMIN') {
      return NextResponse.json(
        {
          error: 'DELETE_REQUIRES_SUPERADMIN',
          message: 'Only a SUPERADMIN can delete a SUPERADMIN account.',
        },
        { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return NextResponse.json(
      { user: result.user },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
