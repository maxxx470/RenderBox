// Phase 6 — GET /api/admin/stats. Powers the /admin overview cards.
// Numbers are computed at request time (aggregate Prisma queries), not
// cached — acceptable at RenderBox's expected admin-traffic volume (see
// PRUNING.md-style "not stored in cache for this V1" note in the spec).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const [activeAccounts, suspendedAccounts, generationsThisMonth, revenue] = await Promise.all([
      prisma.user.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.user.count({ where: { status: 'SUSPENDED', deletedAt: null } }),
      prisma.renderNode.count({
        where: { kind: 'GENERATED', createdAt: { gte: startOfMonth } },
      }),
      prisma.order.aggregate({
        where: { provider: 'maketou', status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    return NextResponse.json(
      {
        activeAccounts,
        suspendedAccounts,
        generationsThisMonth,
        maketouRevenueXof: revenue._sum.amount ?? 0,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
