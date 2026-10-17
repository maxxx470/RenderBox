// GET /api/admin/api-usage — the Kie account behind the engines: its live
// balance and what the images cost (lib/server/admin/api-usage.ts). ADMIN and
// up. Reads only: Kie's balance call costs no credits.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeApiUsage } from '@/lib/server/admin/api-usage';
import { getKieBalance, isKieConfigured } from '@/lib/server/generation/engines/kie';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const usage = await computeApiUsage(
      prisma,
      () => getKieBalance(AbortSignal.timeout(10_000)),
      isKieConfigured(),
    );
    return NextResponse.json(usage, {
      headers: { 'x-request-id': ctx.requestId, 'cache-control': 'no-store' },
    });
  });
}
