// GET /api/projects/[projectId] — project details + its render tree.
// PATCH — rename. DELETE — remove the project, its renders and their blobs.
// RenderNode rows never carry blobUrl here — images are fetched via
// GET /api/render-nodes/[id]/image (see that route for the IDOR-checked proxy).
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { buildRenderTree } from '@/lib/server/render-tree';
import { deleteBlobs } from '@/lib/server/upload/vercel-blob-client';

// Same bounds as POST /api/projects — one shape for one field.
const PatchBody = z.object({ name: z.string().trim().min(1).max(200) });

const notFound = (requestId: string) =>
  NextResponse.json(
    { error: 'PROJECT_NOT_FOUND', message: 'Project not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );

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
      return notFound(ctx.requestId);
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

export async function PATCH(
  req: NextRequest,
  ctx0: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const json = await req.json().catch(() => null);
    const parsed = PatchBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { projectId } = await ctx0.params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });
    // 404 rather than 403 for someone else's project: a 403 would confirm the
    // id exists, which is exactly what an id-guessing probe is after.
    if (!project || project.userId !== auth.user.sub) {
      return notFound(ctx.requestId);
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { name: parsed.data.name },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json(updated, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function DELETE(
  req: NextRequest,
  ctx0: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const { projectId } = await ctx0.params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    });
    if (!project || project.userId !== auth.user.sub) {
      return notFound(ctx.requestId);
    }

    const nodes = await prisma.renderNode.findMany({
      where: { projectId },
      select: { blobUrl: true },
    });

    // Blobs first, rows second. The DB row is the only record of a blob's URL,
    // so deleting rows first and failing here would strand the bytes at a
    // public URL with nothing left pointing at them. `deleteBlobs` is
    // idempotent, so the caller can safely retry the whole operation.
    try {
      await deleteBlobs(nodes.map((n) => n.blobUrl));
    } catch (err) {
      log.error('project.delete.blobs_failed', { projectId, err: String(err) });
      return NextResponse.json(
        { error: 'STORAGE_CLEANUP_FAILED', message: 'Could not delete the stored images' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // RenderNode and Material rows go with it via onDelete: Cascade.
    await prisma.project.delete({ where: { id: projectId } });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
