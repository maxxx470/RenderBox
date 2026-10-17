// GET /api/admin/support/export — the users' messages still waiting for an
// answer, as a CSV file (2026-10-17, owner: « exporter seulement les nouveaux
// messages envoyés par les utilisateurs »). Read or not, a message is « new »
// until the team answers it. ADMIN and up; each export is audited.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { logAdminAction } from '@/lib/server/admin/audit';
import { listPendingMessages, pendingMessagesCsv } from '@/lib/server/support/messages';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;
    const rows = await listPendingMessages(prisma);
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'support.export',
      metadata: { count: rows.length },
    });
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(pendingMessagesCsv(rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="renderpro-messages-${day}.csv"`,
        'cache-control': 'no-store',
        'x-request-id': ctx.requestId,
      },
    });
  });
}
