// PATCH /api/projects/[projectId]/materials/[materialId] — manual correction.
// Forces source: "manuel", confidence: null — a human correction is never
// touched by later auto-detections (see merge.ts).
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { assertProjectOwner, ProjectNotFoundError } from '@/lib/server/idor/assert-project-owner';

const Body = z.object({ valeur: z.string().trim().min(1).max(500) });

export async function PATCH(
  req: NextRequest,
  ctx0: { params: Promise<{ projectId: string; materialId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const { projectId, materialId } = await ctx0.params;
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

    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true, projectId: true },
    });
    if (!existing || existing.projectId !== projectId) {
      return NextResponse.json(
        { error: 'MATERIAL_NOT_FOUND', message: 'Material not found in this project' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const material = await prisma.material.update({
      where: { id: materialId },
      data: { valeur: parsed.data.valeur, source: 'manuel', confidence: null },
      select: {
        id: true,
        face: true,
        valeur: true,
        source: true,
        confidence: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ material }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
