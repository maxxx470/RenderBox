export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { prisma } from '@/lib/server/prisma';
import { createMailer } from '@/lib/server/email';
import { createLogger } from '@/lib/server/logger';
import { runReengagement, SEND_LIMIT } from '@/lib/server/reengagement/run';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();

/**
 * The relance pass (2026-10-31). Once a day is enough: every rule in
 * schedule.ts is counted in days, and nothing is urgent.
 *
 * No Resend, no send — and no row written either, so the relance is simply
 * owed until the keys exist.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    const secret = process.env.JWT_SECRET;

    // The relances are OFF until the owner has read the nine texts on
    // /admin/relances and turned them on (2026-11-01, owner: « on n'a pas
    // encore décidé du texte du mail »). Off by default on purpose: a mail
    // sent cannot be called back, and the keys being in place is not the
    // same thing as the words being approved.
    if (!['1', 'true'].includes((process.env.REENGAGEMENT_ENABLED ?? '').toLowerCase())) {
      log.info('reengagement: off (REENGAGEMENT_ENABLED is not set), nothing sent', {
        requestId: ctx.requestId,
      });
      return NextResponse.json(
        { ok: true, skipped: 'disabled' },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!key || !from) {
      log.warn('reengagement: no mailer (RESEND_API_KEY / EMAIL_FROM missing), nothing sent', {
        requestId: ctx.requestId,
      });
      return NextResponse.json(
        { ok: true, skipped: 'mailer_not_configured' },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!secret) {
      // Without it the unsubscribe links cannot be signed, and an e-mail
      // with no working unsubscribe is worse than no e-mail.
      log.error('reengagement: JWT_SECRET missing, nothing sent', { requestId: ctx.requestId });
      return NextResponse.json(
        { ok: false, error: 'SECRET_MISSING' },
        { status: 500, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Two operator controls, both behind the CRON_SECRET this route
    // already demands, so only Vercel's scheduler and the owner can use
    // them (2026-11-05).
    //
    // `dryRun=1` decides everything and sends nothing — the only way to
    // rehearse the FIRST pass, whose blast radius is real people.
    // `limit=N` caps the sends, so that first pass can be a canary of one
    // before the whole list goes. Neither is a backdoor: without the
    // secret this route answers 401 before reading a single parameter,
    // and the switch and the mailer checks above still apply.
    const params = req.nextUrl.searchParams;
    const dryRun = ['1', 'true'].includes((params.get('dryRun') ?? '').toLowerCase());
    const rawLimit = Number(params.get('limit'));
    const sendLimit =
      Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, SEND_LIMIT) : SEND_LIMIT;

    const result = await runReengagement({
      prisma,
      mailer: createMailer({ RESEND_API_KEY: key, EMAIL_FROM: from }),
      secret,
      requestId: ctx.requestId,
      sendLimit,
      ...(dryRun ? { dryRun: true } : {}),
    });

    log.info('reengagement tick', { ...result, requestId: ctx.requestId });
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

// Vercel Cron sends GET, not POST — without this alias the scheduled
// invocation answers 405 and the pass never runs. It is exactly what
// happened here: the relance cron was declared in vercel.json on
// 2026-10-31 and fired every day at 09:10 into a 405 until 2026-11-04,
// so not one relance was ever considered. The three older daily crons
// carried the alias; this one was written without it and nothing failed
// loudly, because a cron that 405s is silent on our side.
// vercel-json-shape.test.ts now asserts the alias on every declared cron.
export const GET = POST;
