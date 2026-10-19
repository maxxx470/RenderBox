// GET /api/render-nodes/recent — the account's latest generated images, for
// « Images récentes » on the image generator and Améliorer (2026-10-19,
// owner: « les images générées récentes doivent apparaître »). The pages get
// the same list from the server when they load; they read it again here when
// they come back on screen, so a render made on another page or in another
// tab shows up without a reload.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { loadRecentRenders } from '@/app/app/recent-renders';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const images = await loadRecentRenders(auth.user.sub);
    return NextResponse.json({ images }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
