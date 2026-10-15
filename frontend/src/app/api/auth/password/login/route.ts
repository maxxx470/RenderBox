// POST /api/auth/password/login — email + password. 401 INVALID_CREDENTIALS
// for an unknown address and a wrong password alike; 423 ACCOUNT_LOCKED after
// repeated failures; 403 ACCOUNT_SUSPENDED (told only once the password was
// right). See lib/server/auth/password.ts.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { checkPasswordLogin, PASSWORD_MAX_LENGTH } from '@/lib/server/auth/password';
import { issueSession } from '@/lib/server/auth/session';

const Body = z.object({
  email: zEmail,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'auth:login',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_LOGIN_RATE_LIMIT_MAX ?? 10),
  code: 'TOO_MANY_LOGIN_ATTEMPTS',
  message: 'Too many sign-in attempts. Try again later.',
});

const STATUS = { INVALID_CREDENTIALS: 401, ACCOUNT_LOCKED: 423, ACCOUNT_SUSPENDED: 403 } as const;

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_FAILED' }, { status: 400, headers });
    }
    const rateFail = await limiter.check(req, parsed.data.email.toLowerCase());
    if (rateFail) return rateFail;

    const result = await checkPasswordLogin(prisma, parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: STATUS[result.error], headers });
    }
    await issueSession(result.user);
    log.info('password/login: signed in', { userId: result.user.id });
    return NextResponse.json({ ok: true }, { status: 200, headers });
  });
}
