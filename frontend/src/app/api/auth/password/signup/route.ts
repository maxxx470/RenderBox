// POST /api/auth/password/signup — name + email + password, signed in at once
// (2026-10-15, owner: no email verification for now). Only while no email can
// be sent: once Resend is configured, accounts go through the emailed code
// (/code then /confirm) and this route answers 409 VERIFICATION_REQUIRED.
// 409 EMAIL_TAKEN when the address already has an account.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import {
  checkPasswordPolicy,
  createPasswordAccount,
  isEmailSignInConfigured,
  PASSWORD_MAX_LENGTH,
} from '@/lib/server/auth/password';
import { issueSession } from '@/lib/server/auth/session';

const Body = z.object({
  email: zEmail,
  password: z.string().max(PASSWORD_MAX_LENGTH),
  name: z.string().trim().max(120).optional(),
});

const RATE = {
  windowMs: 60 * 60 * 1000,
  code: 'TOO_MANY_SIGNUPS',
  message: 'Too many sign-up attempts. Try again later.',
};
// Per address, and per network (the email is left out, so the IP is the key).
const byEmail = createEmailLimiter(redis ? { redis } : {}, {
  ...RATE,
  bucket: 'auth:password-signup',
  max: Number(process.env.AUTH_SIGNUP_RATE_LIMIT_MAX ?? 5),
});
const byIp = createEmailLimiter(redis ? { redis } : {}, {
  ...RATE,
  bucket: 'auth:password-signup-ip',
  max: Number(process.env.AUTH_SIGNUP_IP_RATE_LIMIT_MAX ?? 10),
});

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };
    if (isEmailSignInConfigured()) {
      return NextResponse.json({ error: 'VERIFICATION_REQUIRED' }, { status: 409, headers });
    }
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_FAILED' }, { status: 400, headers });
    }
    const problem = checkPasswordPolicy(parsed.data.password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400, headers });

    const ipFail = await byIp.check(req, null);
    if (ipFail) return ipFail;
    const emailFail = await byEmail.check(req, parsed.data.email.toLowerCase());
    if (emailFail) return emailFail;

    const result = await createPasswordAccount(prisma, parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409, headers });
    }
    await issueSession(result.user);
    log.info('password/signup: account created', { userId: result.user.id });
    return NextResponse.json({ ok: true }, { status: 201, headers });
  });
}
