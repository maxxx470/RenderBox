// GET /api/admin/renders — every generated image, newest first, with who made
// it and with which engine (?engine=nanobanana|gpt_image, ?userId=…, cursor
// pagination). The pictures load through /api/admin/render-nodes/[id]/image.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { ENGINE_NAMES } from '@/lib/server/generation/engines/types';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const engineRaw = url.searchParams.get('engine');
    const engine = (ENGINE_NAMES as readonly string[]).includes(engineRaw ?? '') ? engineRaw : null;
    const userId = url.searchParams.get('userId');

    const where: Prisma.RenderNodeWhereInput = {
      kind: 'GENERATED',
      ...(engine ? { engine } : {}),
      ...(userId ? { project: { userId } } : {}),
      ...cursorWhere(cursor),
    };
    const rows = await prisma.renderNode.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        createdAt: true,
        engine: true,
        editType: true,
        preset: true,
        project: {
          select: { id: true, user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    const page = buildPage(rows ?? [], limit);
    return NextResponse.json(
      {
        ...page,
        items: page.items.map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          engine: r.engine,
          editType: r.editType,
          preset: r.preset,
          projectId: r.project.id,
          user: r.project.user,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
