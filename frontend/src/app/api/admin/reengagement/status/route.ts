// GET /api/admin/reengagement/status — is the automatic sending on, and can
// anything be sent at all? Read by /admin/relances to say so in words rather
// than leave the owner guessing (2026-11-01). Reads env only.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export interface ReengagementStatus {
  /** REENGAGEMENT_ENABLED — the one switch, flipped once. */
  enabled: boolean;
  /** RESEND_API_KEY + EMAIL_FROM are both in place. */
  mailerConfigured: boolean;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const status: ReengagementStatus = {
      enabled: ['1', 'true'].includes((process.env.REENGAGEMENT_ENABLED ?? '').toLowerCase()),
      mailerConfigured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    };

    return NextResponse.json(status, {
      headers: { 'x-request-id': ctx.requestId, 'cache-control': 'no-store' },
    });
  });
}
