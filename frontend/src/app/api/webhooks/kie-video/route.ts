export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { isValidVideoCallbackToken } from '@/lib/server/video/callback-token';
import { finishVideoJob } from '@/lib/server/video/finish';

const log = createLogger();

/**
 * Kie tells us a clip is done (2026-11-07).
 *
 * This is the project's second route with no CSRF check, and like the
 * one-click unsubscribe it is deliberate: the caller is Kie's own server,
 * with no session and no page of ours. What stands in for the session is the
 * HMAC token on the URL we handed Kie at creation time — an attacker who
 * guesses a job id still cannot forge its token without JWT_SECRET.
 *
 * And the body is never read. Kie publishes no signature for these
 * endpoints, so a body cannot be believed however well-formed it looks: the
 * call is only a TRIGGER, and `finishVideoJob` re-asks Kie through recordInfo
 * before a single credit moves. That is the same rule the Moneriz webhook
 * follows, for the same reason.
 *
 * It answers 200 to anything it will not act on. A webhook that returns an
 * error teaches the sender to retry, and there is nothing here worth
 * retrying: the sweeper catches every job whose callback never landed.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const jobId = req.nextUrl.searchParams.get('job') ?? '';
    const token = req.nextUrl.searchParams.get('token') ?? '';

    if (!jobId || !isValidVideoCallbackToken(jobId, token)) {
      log.warn('kie-video callback refused: bad token', { jobId });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    try {
      const result = await finishVideoJob(prisma, jobId);
      if (!result) {
        // Unknown, already settled, or not yet created at Kie. All normal.
        return NextResponse.json({ ok: true }, { status: 200 });
      }
      log.info('kie-video callback settled a job', {
        jobId,
        status: result.status,
        refunded: result.refunded,
      });
      return NextResponse.json({ ok: true }, { status: 200 });
    } catch (err: unknown) {
      // Kie unreachable, or a clip we could not fetch. The job stays open and
      // the sweeper will try again; failing the callback would only make Kie
      // repeat a call that cannot succeed yet.
      log.error('kie-video callback could not settle the job', {
        jobId,
        err: String(err),
      });
      return NextResponse.json({ ok: true }, { status: 200 });
    }
  });
}

/** Vercel Cron and some senders probe with GET; the three older daily crons
 *  carry the same alias, and a route answering 405 is a silence nobody sees. */
export const GET = POST;
