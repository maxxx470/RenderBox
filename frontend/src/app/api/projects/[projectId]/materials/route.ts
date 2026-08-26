// GET /api/projects/[projectId]/materials — the project's materials sheet.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { assertProjectOwner, ProjectNotFoundError } from '@/lib/server/idor/assert-project-owner';

export async function GET(
  req: NextRequest,
  ctx0: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const { projectId } = await ctx0.params;
    try {
      await assertProjectOwner(projectId, auth.user.sub);
    } catch (e) {
      if (e instanceof ProjectNotFoundError) {
        return NextResponse.json(
          { error: 'PROJECT_NOT_FOUND', message: 'Project not found' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw e;
    }

    const materials = await prisma.material.findMany({
      where: { projectId },
      orderBy: { face: 'asc' },
      select: {
        id: true,
        face: true,
        valeur: true,
        source: true,
        confidence: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ materials }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
