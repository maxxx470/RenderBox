// /api/admin/support/[userId] — one user's conversation, seen by an admin
// (2026-10-17). GET reads it (the user's messages become read); POST { body }
// answers: the message is stored, the user is notified in the bell and sees it
// in the Assistant panel, and the answer is audited (`support.reply`).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { SUPPORT_MAX_LENGTH, readThreadAsAdmin, replyAsAdmin } from '@/lib/server/support/messages';

const Body = z.object({ body: z.string().trim().min(1).max(SUPPORT_MAX_LENGTH) }).strict();

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const headers = { 'x-request-id': reqCtx.requestId };
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;
    const { userId } = await ctx.params;
    const thread = await readThreadAsAdmin(prisma, userId);
    if (!thread) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404, headers });
    return NextResponse.json(thread, { headers });
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const headers = { 'x-request-id': reqCtx.requestId };
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_FAILED' }, { status: 400, headers });
    }
    const { userId } = await ctx.params;
    const message = await replyAsAdmin(prisma, {
      adminId: auth.admin.id,
      userId,
      body: parsed.data.body,
    });
    if (!message) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404, headers });
    return NextResponse.json({ message }, { status: 201, headers });
  });
}
