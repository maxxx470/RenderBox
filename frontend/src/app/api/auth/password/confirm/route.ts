// POST /api/auth/password/confirm — the emailed code + the password: proves
// the address, sets the password, signs the user in. One route for creating
// an account and for choosing a new password (lib/server/auth/password.ts).
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { VERIFICATION_CODE_REGEX } from '@/lib/server/auth';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import {
  checkPasswordPolicy,
  confirmCodeAndSetPassword,
  PASSWORD_MAX_LENGTH,
} from '@/lib/server/auth/password';
import { issueSession } from '@/lib/server/auth/session';

const Body = z.object({
  email: zEmail,
  code: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(VERIFICATION_CODE_REGEX)),
  password: z.string().max(PASSWORD_MAX_LENGTH),
  purpose: z.enum(['signup', 'reset']),
  name: z.string().trim().max(120).optional(),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'auth:password-confirm',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_VERIFY_RATE_LIMIT_MAX ?? 10),
  code: 'TOO_MANY_ATTEMPTS',
  message: 'Too many attempts. Try again later.',
});

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_FAILED' }, { status: 400, headers });
    }
    const problem = checkPasswordPolicy(parsed.data.password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400, headers });

    const rateFail = await limiter.check(req, parsed.data.email.toLowerCase());
    if (rateFail) return rateFail;

    const result = await confirmCodeAndSetPassword(prisma, parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400, headers });
    }
    await issueSession(result.user);
    log.info('password/confirm: signed in', { userId: result.user.id });
    return NextResponse.json({ ok: true }, { status: 200, headers });
  });
}
