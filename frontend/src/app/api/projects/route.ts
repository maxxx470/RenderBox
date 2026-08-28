// GET /api/projects — list the current user's projects (newest first), each
// with its latest render node (for the grid thumbnail) — the DB's
// updatedAt only changes on a direct Project write, not on child
// RenderNode inserts, so it's not a reliable "last activity" signal.
// POST /api/projects — create a new project (Phase 1: name only).
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ name: z.string().trim().min(1).max(200) });

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const projects = await prisma.project.findMany({
      where: { userId: auth.user.sub },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        renderNodes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, createdAt: true },
        },
      },
    });

    const items = projects.map(({ renderNodes, ...project }) => ({
      ...project,
      thumbnailNodeId: renderNodes[0]?.id ?? null,
      lastActivityAt: renderNodes[0]?.createdAt ?? project.createdAt,
    }));

    return NextResponse.json({ projects: items }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const project = await prisma.project.create({
      data: { userId: auth.user.sub, name: parsed.data.name },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json(project, { status: 201, headers: { 'x-request-id': ctx.requestId } });
  });
}
