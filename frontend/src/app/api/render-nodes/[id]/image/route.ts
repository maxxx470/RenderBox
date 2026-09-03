// GET /api/render-nodes/[id]/image — authenticated Blob proxy.
//
// This is the ONLY place server code touches RenderNode.blobUrl for reads.
// Vercel Blob has no private/signed access mode (any URL is fetchable by
// anyone who has it) — streaming through an ownership-checked route is how
// RenderBox keeps images from ever reaching a client that doesn't own the
// project. A redirect to the raw blobUrl would defeat this entirely (the
// client could bookmark/share the Blob URL directly), so we stream bytes.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';

export async function GET(
  req: NextRequest,
  ctx0: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  const auth = await requireAuth(req.headers.get('authorization'));
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx0.params;
  const node = await prisma.renderNode.findUnique({
    where: { id },
    select: {
      blobUrl: true,
      mimeType: true,
      project: { select: { userId: true } },
    },
  });

  if (!node || node.project.userId !== auth.user.sub) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const upstream = await fetch(node.blobUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'IMAGE_FETCH_FAILED' }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': node.mimeType,
      // A RenderNode's bytes never change: the id addresses one immutable
      // upload or one immutable generation, and editing produces a NEW node
      // with a new id. So the browser can keep it for good.
      //
      // `private` keeps it out of shared caches — this is someone's project,
      // and the ownership check above is the only thing standing between it
      // and another account. A year of `max-age=60` meant every dashboard
      // visit re-fetched every thumbnail through this proxy.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
