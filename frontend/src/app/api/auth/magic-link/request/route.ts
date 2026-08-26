// POST /api/auth/magic-link/request — RenderBox's password-less sign-in.
//
// Find-or-create: an email with no existing account gets one created here
// (product decision — there is no separate /inscription page; Google OAuth
// and the magic link are the only two entry points, and the magic link is
// expected to cover email-only signup too). Because the account is thus
// created before the email address is proven reachable, `emailVerifiedAt`
// stays null until the link is actually clicked (see verify-magic-link.ts).
//
// No CSRF: pre-session route, no CSRF cookie exists yet (same carve-out as
// the old verify-email/resend-verification routes).
//
// Rate limiting fails closed when Redis is absent — like the old
// resend-verification route, this is a real per-email send-cost vector.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { generateMagicLinkToken, hashMagicLinkToken } from '@/lib/server/auth/magic-link';
import { enqueueOutbox } from '@/lib/server/outbox';

const TTL_MS = Number(process.env.AUTH_MAGIC_LINK_TTL_MIN ?? 15) * 60 * 1000;

const Body = z.object({ email: zEmail });

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'auth:magic-link',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_MAGIC_LINK_RATE_LIMIT_MAX ?? 3),
  code: 'TOO_MANY_MAGIC_LINK_ATTEMPTS',
  message: 'Too many sign-in attempts. Try again later.',
});

function formatIssues(err: z.ZodError) {
  return err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    if (!redis) {
      log.warn('magic-link/request: Redis missing — refusing request');
      const res = NextResponse.json(
        {
          error: 'RATE_LIMIT_UNAVAILABLE',
          message: 'Sign-in is temporarily unavailable. Try again shortly.',
        },
        { status: 503, headers: { 'Retry-After': '30' } },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      const res = NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: formatIssues(parsed.error) },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    const email = parsed.data.email.toLowerCase();

    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    const appUrl = process.env.APP_URL ?? '';
    if (!appUrl) {
      log.error('magic-link/request: APP_URL not configured — cannot build link');
      const res = NextResponse.json(
        { error: 'APP_URL_NOT_CONFIGURED', message: 'Server misconfiguration.' },
        { status: 500 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const token = generateMagicLinkToken();
    const hash = hashMagicLinkToken(token);
    const expiresAt = new Date(Date.now() + TTL_MS);
    const url = `${appUrl}/api/auth/magic-link/verify?token=${token}&email=${encodeURIComponent(email)}`;

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        create: { email },
        update: {},
        select: { id: true },
      });
      await tx.verificationCode.create({
        data: { userId: user.id, code: hash, type: 'MAGIC_LINK', expiresAt },
      });
      await enqueueOutbox(tx, {
        kind: 'email.magic_link',
        payload: { to: email, url, expiresAt: expiresAt.toISOString() },
      });
    });

    log.info('magic-link/request: link issued');
    const res = NextResponse.json({ ok: true }, { status: 200 });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
  });
}
