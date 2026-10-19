// POST /api/render-nodes/[id]/sheet/analyze — the user copied the materials
// sheet of a render that has no analysis yet (2026-10-19, owner): the analysis
// starts now, in the background, and SHEET_COST credits are taken from the
// USER (never the admin's account) — only now, never at render time. Nothing
// is charged when the sheet is already analysed or running, when no analysis
// key exists, or when the balance does not cover it.
export const runtime = 'nodejs';
export const maxDuration = 120;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { creditRefusalResponse } from '@/lib/server/generation/tier-quota';
import { requestSheetAnalysis } from '@/lib/server/materials/render-sheet';
import { SHEET_COST } from '@/lib/pricing-tiers';

export async function POST(
  req: NextRequest,
  ctx0: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx0.params;
    const out = await requestSheetAnalysis({ nodeId: id, userId: auth.user.sub });
    switch (out.kind) {
      case 'not_found':
        return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
      case 'no_sheet':
        return NextResponse.json({ error: 'NO_SHEET' }, { status: 409 });
      case 'not_configured':
        return NextResponse.json({ error: 'SHEET_NOT_CONFIGURED' }, { status: 503 });
      case 'refused':
        return creditRefusalResponse(out.refusal, SHEET_COST, ctx.requestId);
      case 'already':
        return NextResponse.json({ status: out.status, charged: 0 });
      case 'started':
        return NextResponse.json(
          { status: 'pending', charged: SHEET_COST, balance: out.balance },
          { status: 202 },
        );
    }
  });
}
