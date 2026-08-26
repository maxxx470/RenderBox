// Phase 6 — daily hard-delete of accounts past their soft-delete grace
// window. Mirrors cron/order-expiration's shape (verifyCronSecret →
// withLease → the pure helper → log).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { purgeDeletedAccounts } from '@/lib/server/users/soft-delete';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let purged = 0;
    let skipped = 0;

    await withLease(redis ?? undefined, 'account-purge', LEASE_TTL_MS, async () => {
      const result = await purgeDeletedAccounts({ prisma });
      purged = result.purged;
      skipped = result.skipped;
      log.info('account-purge tick', { purged, skipped, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, purged, skipped },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

// Vercel Cron sends GET, not POST — alias so scheduled invocations succeed.
export const GET = POST;
