// POST /api/auth/password/code — emails an 8-character code, to create an
// account (purpose "signup") or choose a new password ("reset"). Always 200
// with the same body, whether or not the address has an account
// (enumeration resistance); 503 EMAIL_NOT_CONFIGURED until Resend is set up.
// See lib/server/auth/password.ts.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { getMailer, issueCode } from '@/lib/server/auth/password';

const Body = z.object({
  email: zEmail,
  purpose: z.enum(['signup', 'reset']),
  locale: z.enum(['fr', 'en']).default('fr'),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'auth:password-code',
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.AUTH_RESEND_VERIFY_RATE_LIMIT_MAX ?? 5),
  code: 'TOO_MANY_CODE_REQUESTS',
  message: 'Too many codes requested. Try again later.',
});

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };
    const mailer = getMailer();
    if (!mailer) {
      return NextResponse.json(
        { error: 'EMAIL_NOT_CONFIGURED', message: 'Email sign-in is not available yet.' },
        { status: 503, headers },
      );
    }
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_FAILED' }, { status: 400, headers });
    }
    const rateFail = await limiter.check(req, parsed.data.email.toLowerCase());
    if (rateFail) return rateFail;

    try {
      await issueCode(prisma, mailer, parsed.data);
    } catch (err) {
      log.error('password/code: could not send the code', {
        err: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: 'EMAIL_SEND_FAILED', message: 'The code could not be sent. Try again.' },
        { status: 502, headers },
      );
    }
    return NextResponse.json({ ok: true }, { status: 200, headers });
  });
}
