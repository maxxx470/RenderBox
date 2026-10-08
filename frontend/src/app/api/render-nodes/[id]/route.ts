// DELETE /api/render-nodes/[id] — remove a render and everything derived
// from it, blobs included, then return the project's fresh tree.
//
// ?scope=single (Mes images, owner 2026-10-08: "seulement l'image") removes
// that one image only. What was made from it is kept and moves up to the
// image it came from, so the tree keeps a lineage instead of orphans; a
// project left with no image at all goes too, being nothing but a container.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { buildRenderTree, collectBranch, type FlatRenderNode } from '@/lib/server/render-tree';
import { deleteBlobs } from '@/lib/server/upload/vercel-blob-client';

export async function DELETE(
  req: NextRequest,
  ctx0: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx0.params;
    const node = await prisma.renderNode.findUnique({
      where: { id },
      select: { projectId: true, project: { select: { userId: true } } },
    });
    // 404 rather than 403 on someone else's node: a 403 would confirm the id.
    if (!node || node.project.userId !== auth.user.sub) {
      return NextResponse.json(
        { error: 'NODE_NOT_FOUND', message: 'Render not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const all = await prisma.renderNode.findMany({
      where: { projectId: node.projectId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        parentId: true,
        kind: true,
        createdAt: true,
        preset: true,
        engine: true,
        blobUrl: true,
      },
    });

    if (req.nextUrl.searchParams.get('scope') === 'single') {
      const target = all.find((n) => n.id === id);
      if (!target) {
        return NextResponse.json(
          { error: 'NODE_NOT_FOUND', message: 'Render not found' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      // Blob first, row second — see below.
      try {
        await deleteBlobs([target.blobUrl]);
      } catch (err) {
        log.error('render-node.delete.blobs_failed', { nodeId: id, err: String(err) });
        return NextResponse.json(
          { error: 'STORAGE_CLEANUP_FAILED', message: 'Could not delete the stored images' },
          { status: 502, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      const projectEmpty = all.length === 1;
      await prisma.$transaction([
        prisma.renderNode.updateMany({
          where: { parentId: id },
          data: { parentId: target.parentId },
        }),
        prisma.renderNode.delete({ where: { id } }),
        ...(projectEmpty ? [prisma.project.delete({ where: { id: node.projectId } })] : []),
      ]);
      const remaining: FlatRenderNode[] = all
        .filter((n) => n.id !== id)
        .map(({ blobUrl: _blobUrl, ...rest }) =>
          rest.parentId === id ? { ...rest, parentId: target.parentId } : rest,
        );
      return NextResponse.json(
        { deletedCount: 1, tree: buildRenderTree(remaining) },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const branch = collectBranch(all, id);
    const branchIds = new Set(branch.map((n) => n.id));

    // Blobs first, rows second — same reasoning as deleting a project: the row
    // is the only record of a blob's URL, and that URL stays publicly
    // fetchable. deleteBlobs is idempotent, so a failed attempt is safe to
    // retry in full.
    try {
      await deleteBlobs(branch.map((n) => n.blobUrl));
    } catch (err) {
      log.error('render-node.delete.blobs_failed', { nodeId: id, err: String(err) });
      return NextResponse.json(
        { error: 'STORAGE_CLEANUP_FAILED', message: 'Could not delete the stored images' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.renderNode.deleteMany({ where: { id: { in: [...branchIds] } } });

    const remaining: FlatRenderNode[] = all
      .filter((n) => !branchIds.has(n.id))
      .map(({ blobUrl: _blobUrl, ...rest }) => rest);

    return NextResponse.json(
      { deletedCount: branch.length, tree: buildRenderTree(remaining) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
