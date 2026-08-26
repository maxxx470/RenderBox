// Phase 6 — POST /api/admin/users/[id]/restore
//
// Clears User.deletedAt during the ACCOUNT_DELETION_GRACE_DAYS window.
// SUPERADMIN-only, mirroring the SUSPENDED→ACTIVE restore gate on
// /api/admin/users/[id]/status — reversing a destructive-looking admin
// action is a higher bar than performing one.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;

    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id },
        select: { id: true, deletedAt: true },
      });
      if (!target) return { kind: 'NOT_FOUND' as const };

      // Idempotent no-op: already active → no AdminAction write.
      if (!target.deletedAt) {
        return { kind: 'OK' as const, user: { id: target.id, deletedAt: null as Date | null } };
      }

      const updated = await tx.user.update({
        where: { id },
        data: { deletedAt: null },
        select: { id: true, deletedAt: true },
      });

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'user.restore_deleted',
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
    return NextResponse.json(
      { user: result.user },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
