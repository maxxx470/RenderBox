// POST /api/admin/users/[id]/credits — give or take back credits by hand
// (a gesture, a refund, a correction). { delta, reason }: delta is a whole
// number of credits, positive to add, negative to remove; the balance never
// goes below zero (one conditional UPDATE, as debitCredits does). Audited:
// `user.credits_adjust` with the delta, the reason and the new balance.
//
// Since 2026-10-26 (owner) a gift has to fit in the Kie stock: a site credit
// IS a Kie credit, so credits given away that Kie cannot honour are a promise
// the stock does not cover. The room is Kie's live balance minus the credits
// every account already holds, read in the same transaction as the update, and
// a gift bigger than the room is refused (409 STOCK_TOO_LOW) — Kie silent,
// 503 STOCK_UNKNOWN. Taking credits back needs no room: it gives some back,
// the circulation falling by exactly what was removed. Two admins giving at
// the very same instant can both pass, as with the generation cap.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import {
  readStockBalance,
  stockRefusal,
  stockRoom,
  type StockRefusal,
} from '@/lib/server/admin/kie-stock';
import { getKieBalance, isKieConfigured } from '@/lib/server/generation/engines/kie';
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

const stockUnknown: StockRefusal = { error: 'STOCK_UNKNOWN' };

type Outcome =
  | { kind: 'NOT_FOUND' }
  | { kind: 'INSUFFICIENT' }
  | { kind: 'STOCK'; refusal: StockRefusal }
  | { kind: 'OK'; creditsBalance: number; room: number | null };

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

    // Read outside the transaction: it is an HTTP call to Kie, and a Neon
    // transaction has two seconds to live.
    const stock =
      delta > 0
        ? await readStockBalance(isKieConfigured(), () =>
            getKieBalance(AbortSignal.timeout(10_000)),
          )
        : ({ kind: 'open' } as const);

    const outcome: Outcome = await prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return { kind: 'NOT_FOUND' as const };
      if (stock.kind === 'unknown') return { kind: 'STOCK' as const, refusal: stockUnknown };
      if (stock.kind === 'known') {
        const held = await tx.user.aggregate({
          where: { creditsBalance: { gt: 0 } },
          _sum: { creditsBalance: true },
        });
        const refusal = stockRefusal(stock, delta, held._sum.creditsBalance ?? 0);
        if (refusal) return { kind: 'STOCK' as const, refusal };
      }
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
      // What the stock has left once this gift is out: the admin sees at once
      // how much room is still there. Null when there is no stock to respect,
      // and for a removal, which is never held back.
      if (stock.kind !== 'known') return { kind: 'OK' as const, creditsBalance, room: null };
      const circulationAfter = await tx.user.aggregate({
        where: { creditsBalance: { gt: 0 } },
        _sum: { creditsBalance: true },
      });
      return {
        kind: 'OK' as const,
        creditsBalance,
        room: stockRoom(stock, circulationAfter._sum.creditsBalance ?? 0),
      };
    });

    if (outcome.kind === 'NOT_FOUND') {
      return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404, headers });
    }
    if (outcome.kind === 'INSUFFICIENT') {
      return NextResponse.json({ error: 'INSUFFICIENT_CREDITS' }, { status: 409, headers });
    }
    if (outcome.kind === 'STOCK') {
      return NextResponse.json(outcome.refusal, {
        status: outcome.refusal.error === 'STOCK_UNKNOWN' ? 503 : 409,
        headers,
      });
    }
    return NextResponse.json(
      { creditsBalance: outcome.creditsBalance, room: outcome.room },
      { headers },
    );
  });
}
