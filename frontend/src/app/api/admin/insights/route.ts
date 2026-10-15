// GET /api/admin/insights — the RenderPro overview of the back-office
// (lib/server/admin/insights.ts): sign-ups, plans, renders per engine,
// revenue, and what the onboarding tells about the users. ADMIN and up.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeInsights } from '@/lib/server/admin/insights';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const insights = await computeInsights(prisma);
    return NextResponse.json(insights, { headers: { 'x-request-id': ctx.requestId } });
  });
}
