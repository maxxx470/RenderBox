// PATCH /api/users/me — the account's generation preferences: the default
// engine (from /parametres and the onboarding) and, since 2026-10-16, the
// version chosen for an engine (from /parametres and the command bar's
// version chip; it lived in the browser's localStorage before — owner:
// « liée au compte »). Either or both; the profile itself goes through
// /api/users/me/profile.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { ENGINE_NAMES } from '@/lib/server/generation/engines/types';
import {
  ENGINE_VERSION_KEYS,
  ENGINE_VERSIONS,
  parseEngineVersions,
} from '@/lib/server/generation/engine-versions';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z
  .object({
    defaultEngine: z.enum(ENGINE_NAMES).optional(),
    /** One version; it replaces the chosen version of ITS engine. */
    engineVersion: z.enum(ENGINE_VERSION_KEYS).optional(),
  })
  .strict()
  .refine((b) => b.defaultEngine !== undefined || b.engineVersion !== undefined);

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers },
      );
    }
    const { defaultEngine, engineVersion } = parsed.data;

    let engineVersions: ReturnType<typeof parseEngineVersions> | undefined;
    if (engineVersion) {
      const current = await prisma.user.findUnique({
        where: { id: auth.user.sub },
        select: { engineVersions: true },
      });
      engineVersions = {
        ...parseEngineVersions(current?.engineVersions),
        [ENGINE_VERSIONS[engineVersion].engine]: engineVersion,
      };
    }

    const updated = await prisma.user.update({
      where: { id: auth.user.sub },
      data: {
        ...(defaultEngine ? { defaultEngine } : {}),
        ...(engineVersions ? { engineVersions } : {}),
      },
      select: { defaultEngine: true, engineVersions: true },
    });

    return NextResponse.json(
      {
        defaultEngine: updated.defaultEngine,
        engineVersions: parseEngineVersions(updated.engineVersions),
      },
      { status: 200, headers },
    );
  });
}
