// /api/support/messages — the user's conversation with the RenderPro team
// (2026-10-17, owner): the in-app Assistant panel is a message box. GET reads
// the conversation (and marks the team's answers read); POST { body } sends a
// message, which an admin answers from /admin/messages
// (lib/server/support/messages.ts). At most SUPPORT_HOURLY_LIMIT per hour.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  SUPPORT_MAX_LENGTH,
  postUserMessage,
  readUserConversation,
} from '@/lib/server/support/messages';

const Body = z.object({ body: z.string().trim().min(1).max(SUPPORT_MAX_LENGTH) }).strict();

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;
    const messages = await readUserConversation(prisma, auth.user.sub);
    return NextResponse.json({ messages }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_FAILED' }, { status: 400, headers });
    }
    const outcome = await postUserMessage(prisma, auth.user.sub, parsed.data.body);
    if (outcome.kind === 'RATE_LIMITED') {
      return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429, headers });
    }
    return NextResponse.json({ message: outcome.message }, { status: 201, headers });
  });
}
