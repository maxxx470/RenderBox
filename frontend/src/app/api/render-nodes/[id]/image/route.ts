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
import sharp from 'sharp';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';

/** `?size=thumb` (2026-10-18, owner: a picture on each row of the project
 *  tree): the image shrunk to this long edge, as WebP — a few kB instead of
 *  the 2–4 MB original. One fixed size, so the parameter cannot be used to
 *  make the server resize to arbitrary dimensions. */
const THUMB_EDGE = 192;

// The browser keeps a node's bytes for good (see below), the thumbnail too.
const CACHE = 'private, max-age=31536000, immutable';

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

  if (req.nextUrl.searchParams.get('size') === 'thumb') {
    const original = Buffer.from(await upstream.arrayBuffer());
    const thumb = await sharp(original)
      .rotate()
      .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    return new Response(new Uint8Array(thumb), {
      status: 200,
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': CACHE },
    });
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
      'Cache-Control': CACHE,
    },
  });
}
