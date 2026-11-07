export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { sweepVideoJobs } from '@/lib/server/video/sweep';

const log = createLogger();

/**
 * The pass that makes the video callback optional (2026-11-07).
 *
 * It is NOT in vercel.json, and that is deliberate: the project runs on
 * Vercel Hobby, where a declared cron may only run once a day, and a daily
 * sweep of a thirty-minute deadline would leave a user waiting half a day
 * for credits they are already owed. So it joins the four sub-daily routes
 * on the external scheduler (every 5 minutes), like outbox-drain — guarded
 * by the same CRON_SECRET, and invoked by POST.
 *
 * GET answers too, so that if it is ever moved into vercel.json it does not
 * 405 into silence the way /api/cron/reengagement did for four days.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const result = await sweepVideoJobs(prisma);
    if (result.settled > 0 || result.expired > 0) {
      log.info('video sweep', { ...result });
    }
    return NextResponse.json({ ok: true, ...result });
  });
}

export const GET = POST;
