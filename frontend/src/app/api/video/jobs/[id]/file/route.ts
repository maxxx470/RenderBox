// GET /api/video/jobs/[id]/file — the finished clip, for its owner only.
//
// Two storages, two answers, and the difference matters:
//
//   - on R2 the row holds a KEY, not a link. We mint a presigned URL and
//     REDIRECT: the bytes go straight from Cloudflare to the browser, whose
//     egress is free, and the link dies in six hours. Tens of megabytes
//     never cross Vercel.
//   - on Vercel Blob there is no private mode — any URL is fetchable by
//     anyone holding it — so the bytes are STREAMED through here, exactly as
//     the image proxy does. Correct, and the reason R2 exists.
//
// Either way the ownership check happens first, and the row's stored
// location is never sent to the client.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { r2KeyFrom, signedVideoUrl, VIDEO_URL_TTL_SECONDS } from '@/lib/server/video/r2';

export async function GET(
  req: NextRequest,
  ctx0: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  const auth = await requireAuth(req.headers.get('authorization'));
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx0.params;
  const job = await prisma.videoJob.findFirst({
    where: { id, userId: auth.user.sub },
    select: { blobUrl: true, mimeType: true, status: true },
  });

  // Not theirs, or not finished: the same 404 either way, so the route never
  // says whether someone else's job exists.
  if (!job || job.status !== 'SUCCEEDED' || !job.blobUrl) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const key = r2KeyFrom(job.blobUrl);
  if (key) {
    const url = await signedVideoUrl(key);
    return NextResponse.redirect(url, {
      status: 302,
      // The redirect itself may be cached only as long as the link lives,
      // and only in this viewer's own browser.
      headers: { 'Cache-Control': `private, max-age=${VIDEO_URL_TTL_SECONDS - 300}` },
    });
  }

  const upstream = await fetch(job.blobUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'VIDEO_FETCH_FAILED' }, { status: 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': job.mimeType ?? 'video/mp4',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
