// GET /api/render-nodes/[id]/sheet — the image's public code and its
// materials sheet (2026-10-19, owner). The code is given on first sight (an
// image shown on the site always has one); the sheet is what the render's
// analysis wrote: "pending" while it runs, then "ready" with its lines, or
// "unavailable" / "failed". Ownership is checked like the image proxy's: an
// image of another account answers 404, never 403.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { ensureNodeCode, readSheet } from '@/lib/server/materials/render-sheet';

export async function GET(
  req: NextRequest,
  ctx0: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx0.params;
    const node = await prisma.renderNode.findUnique({
      where: { id },
      select: { kind: true, preset: true, sheet: true, project: { select: { userId: true } } },
    });
    if (!node || node.project.userId !== auth.user.sub) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    const code = await ensureNodeCode(id);
    return NextResponse.json(
      { code, kind: node.kind, preset: node.preset, sheet: readSheet(node.sheet) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
