// PATCH /api/users/me — Phase 6. Currently the sole self-service profile
// mutation: the preferred generation engine, set from /parametres and
// pre-selected in /app's command bar (replaces the Phase 4 localStorage
// preference — see AppShell.tsx).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { ENGINE_NAMES } from '@/lib/server/generation/engines/types';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  defaultEngine: z.enum(ENGINE_NAMES),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const updated = await prisma.user.update({
      where: { id: auth.user.sub },
      data: { defaultEngine: parsed.data.defaultEngine },
      select: { defaultEngine: true },
    });

    return NextResponse.json(
      { defaultEngine: updated.defaultEngine },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
