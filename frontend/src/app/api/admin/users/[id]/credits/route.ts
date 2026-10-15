// POST /api/admin/users/[id]/credits — give or take back credits by hand
// (a gesture, a refund, a correction). { delta, reason }: delta is a whole
// number of credits, positive to add, negative to remove; the balance never
// goes below zero (one conditional UPDATE, as debitCredits does). Audited:
// `user.credits_adjust` with the delta, the reason and the new balance.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  delta: z
    .number()
    .int()
    .min(-100_000)
    .max(100_000)
    .refine((n) => n !== 0),
  reason: z.string().trim().min(3).max(200),
});

type Outcome =
  | { kind: 'NOT_FOUND' }
  | { kind: 'INSUFFICIENT' }
  | { kind: 'OK'; creditsBalance: number };

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const headers = { 'x-request-id': reqCtx.requestId };
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_FAILED' }, { status: 400, headers });
    }
    const { delta, reason } = parsed.data;
    const { id } = await ctx.params;

    const outcome: Outcome = await prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return { kind: 'NOT_FOUND' as const };
      const done = await tx.user.updateMany({
        where: { id, ...(delta < 0 ? { creditsBalance: { gte: -delta } } : {}) },
        data: { creditsBalance: { increment: delta } },
      });
      if (done.count === 0) return { kind: 'INSUFFICIENT' as const };
      const after = await tx.user.findUnique({ where: { id }, select: { creditsBalance: true } });
      const creditsBalance = after?.creditsBalance ?? 0;
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'user.credits_adjust',
        targetType: 'User',
        targetId: id,
        metadata: { delta, reason, creditsBalance },
      });
      return { kind: 'OK' as const, creditsBalance };
    });

    if (outcome.kind === 'NOT_FOUND') {
      return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404, headers });
    }
    if (outcome.kind === 'INSUFFICIENT') {
      return NextResponse.json({ error: 'INSUFFICIENT_CREDITS' }, { status: 409, headers });
    }
    return NextResponse.json({ creditsBalance: outcome.creditsBalance }, { headers });
  });
}
