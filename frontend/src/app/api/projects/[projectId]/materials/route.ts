// GET /api/projects/[projectId]/materials — the project's materials sheet.
//
// Each row also says whether it is attached to an image (étape 3C.5.3, the
// explicit attach of étape 3C.5.2): `attached`, and — only when that image is
// one of THIS project's — `attachedNodeId` and `attachedAt`. A mark pointing
// anywhere else (an image gone, another project's) still reads as attached,
// the row cannot be attached again, but names nothing. The fields are added
// to the existing ones; nothing existing changes. There is no image name in
// the schema: the client names the image from its own tree.
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

    const rows = await prisma.material.findMany({
      where: { projectId },
      orderBy: { face: 'asc' },
      select: {
        id: true,
        face: true,
        valeur: true,
        source: true,
        confidence: true,
        updatedAt: true,
        attachedNodeId: true,
        attachedAt: true,
      },
    });

    // The attached images that belong to this project — the only ones named.
    const marked = [...new Set(rows.flatMap((r) => (r.attachedNodeId ? [r.attachedNodeId] : [])))];
    const own =
      marked.length === 0
        ? new Set<string>()
        : new Set(
            (
              await prisma.renderNode.findMany({
                where: { id: { in: marked }, projectId },
                select: { id: true },
              })
            ).map((n) => n.id),
          );

    const materials = rows.map(({ attachedNodeId, attachedAt, ...row }) => {
      const visible = attachedNodeId !== null && own.has(attachedNodeId);
      return {
        ...row,
        attached: attachedNodeId !== null,
        attachedNodeId: visible ? attachedNodeId : null,
        attachedAt: visible ? attachedAt : null,
      };
    });

    return NextResponse.json({ materials }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
