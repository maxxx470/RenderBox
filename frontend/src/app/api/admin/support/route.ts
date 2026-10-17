// GET /api/admin/support — every conversation with the users, the latest
// first, with what no admin has read yet (/admin/messages, 2026-10-17).
// ?count=1 answers only { unreadThreads }, for the nav's badge.
// ADMIN and up.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { countUnreadThreads, listThreads } from '@/lib/server/support/messages';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;
    if (req.nextUrl.searchParams.get('count') === '1') {
      return NextResponse.json(
        { unreadThreads: await countUnreadThreads(prisma) },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const threads = await listThreads(prisma);
    return NextResponse.json(
      { threads, unreadThreads: threads.filter((th) => th.unread > 0).length },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
