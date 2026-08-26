// GET /api/projects/[projectId] — project details + its render tree.
// RenderNode rows never carry blobUrl here — images are fetched via
// GET /api/render-nodes/[id]/image (see that route for the IDOR-checked proxy).
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { buildRenderTree } from '@/lib/server/render-tree';

export async function GET(
  req: NextRequest,
  ctx0: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const { projectId } = await ctx0.params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, name: true, createdAt: true, updatedAt: true },
    });
    if (!project || project.userId !== auth.user.sub) {
      return NextResponse.json(
        { error: 'PROJECT_NOT_FOUND', message: 'Project not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const nodes = await prisma.renderNode.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, parentId: true, kind: true, createdAt: true, preset: true, engine: true },
    });

    return NextResponse.json(
      {
        project: {
          id: project.id,
          name: project.name,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
        tree: buildRenderTree(nodes),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
