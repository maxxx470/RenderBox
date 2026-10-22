// POST /api/admin/kie-topups — records a top-up of the Kie account made on
// kie.ai ({ amountUsd, credits, note? }), for the history of the « Stock Kie »
// page. It changes no balance: Kie's balance is always read live from Kie.
// Audited as `kie.topup`. ADMIN and up.
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
  amountUsd: z.number().positive().max(100_000),
  credits: z.number().positive().max(100_000_000),
  note: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };
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
    const { amountUsd, credits, note } = parsed.data;

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.kieTopUp.create({
        data: { amountUsd, credits, note: note || null, adminId: auth.admin.id },
        select: { id: true, createdAt: true },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'kie.topup',
        targetType: 'KieTopUp',
        targetId: created.id,
        metadata: { amountUsd, credits, ...(note ? { note } : {}) },
      });
      return created;
    });
    return NextResponse.json(
      { id: row.id, createdAt: row.createdAt.toISOString() },
      { status: 201, headers },
    );
  });
}
