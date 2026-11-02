// GET /api/admin/moneyfusion-check — « est-ce que MoneyFusion accepte nos
// appels ? » (2026-11-01). The IP allowlist on their application form is the
// one thing that can silently stop every payment, and the only way to know is
// to call them. Their error names the blocked IP in parentheses, so this
// returns the message VERBATIM — that text is the whole point of the route.
//
// It does NOT create an Order. It asks MoneyFusion to open a payment session
// and throws the result away, so nothing in our base changes and no customer
// is involved. **The payment URL is deliberately NOT returned**: a session
// with no Order behind it must never be payable by anyone who sees this
// response, since there would be nothing to credit. Only the token's first
// characters come back, enough to recognise it in MoneyFusion's dashboard.
//
// ADMIN-only. Read-only on our side.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  moneyfusionCheckout,
  isMoneyfusionConfigured,
  getTierAmount,
} from '@/lib/server/payments/moneyfusion';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const headers = { 'x-request-id': ctx.requestId, 'cache-control': 'no-store' };

    if (!isMoneyfusionConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'MONEYFUSION_API_URL is not set on this deployment.',
        },
        { headers },
      );
    }

    const appUrl = process.env.APP_URL ?? req.nextUrl.origin;
    try {
      const res = await moneyfusionCheckout({
        tier: 'decouverte',
        // A number MoneyFusion will accept in shape; nobody is charged.
        phone: '0700000000',
        name: 'RenderPro diagnostic',
        // No Order exists behind this: the marker makes that obvious in their
        // dashboard, and our webhook ignores a payment it cannot match.
        orderId: `diagnostic-${Date.now()}`,
        returnUrl: `${appUrl}/paiement/retour`,
      });

      return NextResponse.json(
        {
          ok: true,
          message: 'MoneyFusion accepted the call — the IP allowlist is not blocking us.',
          tokenPreview: `${res.token.slice(0, 6)}…`,
          amountSentXof: getTierAmount('decouverte'),
          region: process.env.VERCEL_REGION ?? null,
        },
        { headers },
      );
    } catch (e) {
      // Verbatim: their message names the blocked IP when that is the cause.
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          ok: false,
          error: message,
          hint: 'If this names an IP address, add it to the application’s allowed IPs in the MoneyFusion dashboard — and read /api/admin/egress-ip first, because a Vercel function has no stable outbound address.',
          region: process.env.VERCEL_REGION ?? null,
        },
        { headers },
      );
    }
  });
}
