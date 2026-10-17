// GET /api/admin/accounting — what came in against what went out, month by
// month, in FCFA (lib/server/admin/accounting.ts). ADMIN and up. Reads only.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeAccounting } from '@/lib/server/admin/accounting';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const accounting = await computeAccounting(prisma);
    return NextResponse.json(accounting, {
      headers: { 'x-request-id': ctx.requestId, 'cache-control': 'no-store' },
    });
  });
}
