// Phase 6 — every 5 minutes, re-verify PENDING orders against the provider
// directly. Safety net for a customer who paid but closed the tab before the
// return-page verification ran, and for a webhook that never arrived.
//
// It sweeps BOTH providers since 2026-11-01: MoneyFusion, which takes the
// payments now, and Maketou, whose PENDING orders from before the switch must
// still be able to settle. **The route keeps its `maketou-reconcile` path on
// purpose** — it is the URL the owner's external scheduler already calls (the
// five sub-daily crons do not fit Vercel Hobby's count) and the one the
// vercel-json-shape tripwire knows. Renaming it would break both for a
// cosmetic gain.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { reconcileMaketouOrder } from '@/lib/server/payments/maketou-reconcile';
import { isMaketouApiConfigured } from '@/lib/server/payments/maketou';
import { reconcileMoneyfusionOrder } from '@/lib/server/payments/moneyfusion-reconcile';
import { isMoneyfusionConfigured } from '@/lib/server/payments/moneyfusion';
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
      const providers = [
        ...(isMoneyfusionConfigured() ? ['moneyfusion'] : []),
        ...(isMaketouApiConfigured() ? ['maketou'] : []),
      ];
      if (providers.length === 0) {
        log.info('payments-reconcile tick: no provider configured, skipping', {
          requestId: ctx.requestId,
        });
        return;
      }

      const pending = await prisma.order.findMany({
        where: { provider: { in: providers }, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
        select: {
          id: true,
          status: true,
          providerChargeId: true,
          userId: true,
          metadata: true,
          provider: true,
          amount: true,
        },
      });

      for (const order of pending) {
        checked++;
        try {
          const result =
            order.provider === 'moneyfusion'
              ? await reconcileMoneyfusionOrder(prisma, order)
              : await reconcileMaketouOrder(prisma, order);
          if (result.changed) changed++;
        } catch (e) {
          log.warn('payments-reconcile: verification failed (will retry next tick)', {
            orderId: order.id,
            provider: order.provider,
            err: String(e),
          });
        }
      }

      log.info('payments-reconcile tick', {
        checked,
        changed,
        providers,
        requestId: ctx.requestId,
      });
    });

    return NextResponse.json(
      { ok: true, checked, changed },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
