// GET /api/admin/kie-stock — the « Stock Kie » page (lib/server/admin/
// kie-stock.ts): Kie's live balance (read only, never written), the credits
// the accounts hold, the coverage, the images the stock still makes, the
// finances and each plan's guaranteed margin, the top-up history. ADMIN and up.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeKieStock } from '@/lib/server/admin/kie-stock';
import { getKieBalance, isKieConfigured } from '@/lib/server/generation/engines/kie';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const stock = await computeKieStock(
      prisma,
      () => getKieBalance(AbortSignal.timeout(10_000)),
      isKieConfigured(),
    );
    return NextResponse.json(stock, {
      headers: { 'x-request-id': ctx.requestId, 'cache-control': 'no-store' },
    });
  });
}
