// GET /api/admin/render-nodes/[id]/image — any image, for the back-office's
// Rendus page and user files (ADMIN and up). The owner-only proxy
// (/api/render-nodes/[id]/image) stays as it is: this is a separate door,
// gated by the admin role, streamed the same way (the Blob URL never leaves
// the server).
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  const auth = await requireAdmin('ADMIN');
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const node = await prisma.renderNode.findUnique({
    where: { id },
    select: { blobUrl: true, mimeType: true },
  });
  if (!node) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const upstream = await fetch(node.blobUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'IMAGE_FETCH_FAILED' }, { status: 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: { 'Content-Type': node.mimeType, 'Cache-Control': 'private, max-age=86400' },
  });
}
