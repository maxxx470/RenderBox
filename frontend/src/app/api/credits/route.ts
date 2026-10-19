// GET /api/credits — the account's credit balance, read fresh (2026-10-19,
// owner: « il faut actualiser pour voir combien il reste »). The header, the
// generator and Améliorer ask for it when the tab comes back on screen and
// after anything that spends or gives back credits (a render, an analysis,
// a refund), so the figure is right without a reload.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getCreditStatus } from '@/lib/server/generation/tier-quota';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;
    const status = await getCreditStatus(prisma, auth.user.sub);
    return NextResponse.json(
      { remaining: status.remaining, tier: status.tier, max: status.max },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
