// Phase 6 — every 5 minutes, re-verify PENDING Maketou orders against the
// provider directly (Maketou has no reliable webhook — see maketou.ts's
// module doc). Safety net for a customer who paid but closed the tab before
// the return-page verification ran.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { reconcileMaketouOrder } from '@/lib/server/payments/maketou-reconcile';
import { isMaketouApiConfigured } from '@/lib/server/payments/maketou';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000;
const BATCH_SIZE = 100;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let checked = 0;
    let changed = 0;

    await withLease(redis ?? undefined, 'maketou-reconcile', LEASE_TTL_MS, async () => {
      if (!isMaketouApiConfigured()) {
        log.info('maketou-reconcile tick: provider not configured, skipping', {
          requestId: ctx.requestId,
        });
        return;
      }

      const pending = await prisma.order.findMany({
        where: { provider: 'maketou', status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
        select: { id: true, status: true, providerChargeId: true },
      });

      for (const order of pending) {
        checked++;
        try {
          const result = await reconcileMaketouOrder(prisma, order);
          if (result.changed) changed++;
        } catch (e) {
          log.warn('maketou-reconcile: cart verification failed (will retry next tick)', {
            orderId: order.id,
            err: String(e),
          });
        }
      }

      log.info('maketou-reconcile tick', { checked, changed, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, checked, changed },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
