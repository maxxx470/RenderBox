// GET /api/projects/[projectId]/nodes/[nodeId]/materials — every material
// face ONE image knows of, resolved (étape 3C.4): the list the materials
// panel shows. Each face says its value, where it comes from (detection or
// correction), the user's correction on it (none, a value, a removal) and the
// detection under it, so a removed face can be brought back. Removed faces
// are listed too. Since étape 3C.5.5 each face also says where its
// correction comes from, as stored (correctionOrigin: "legacy_attach" for a
// row of the old sheet attached and untouched, "user", or null).
//
// Reading only: no detection is started, nothing is written, no AI call.
// Only this node's rows are read — never another image's, never the
// project's old Material sheet. A database error is a 503, never an empty or
// partial list. One face at a time is read and written by ./[face]/route.ts.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { assertProjectOwner, ProjectNotFoundError } from '@/lib/server/idor/assert-project-owner';
import { log } from '@/lib/server/observability/log';
import { describeNodeFaces, loadNodeMaterialRows } from '@/lib/server/materials/node-materials';

interface RouteParams {
  params: Promise<{ projectId: string; nodeId: string }>;
}

type Ctx = ReturnType<typeof makeRequestContext>;

function fail(ctx: Ctx, status: number, error: string, message: string) {
  return NextResponse.json(
    { error, message },
    { status, headers: { 'x-request-id': ctx.requestId } },
  );
}

/** A database failure: logged by its code only, answered without detail. */
function unavailable(ctx: Ctx, step: string, err: unknown) {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
  log.warn('node materials list: database error', { step, code });
  return fail(ctx, 503, 'MATERIALS_UNAVAILABLE', 'Materials are unavailable, try again');
}

export async function GET(req: NextRequest, ctx0: RouteParams): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const { projectId, nodeId } = await ctx0.params;
    try {
      await assertProjectOwner(projectId, auth.user.sub);
    } catch (e) {
      if (e instanceof ProjectNotFoundError) {
        return fail(ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
      }
      throw e;
    }

    let node;
    try {
      node = await prisma.renderNode.findUnique({
        where: { id: nodeId },
        select: { projectId: true },
      });
    } catch (e) {
      return unavailable(ctx, 'node', e);
    }
    if (!node || node.projectId !== projectId) {
      return fail(ctx, 404, 'NODE_NOT_FOUND', 'Image not found in this project');
    }

    let rows;
    try {
      rows = await loadNodeMaterialRows(nodeId);
    } catch (e) {
      return unavailable(ctx, 'read', e);
    }

    return NextResponse.json(
      { materials: describeNodeFaces(nodeId, rows) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
