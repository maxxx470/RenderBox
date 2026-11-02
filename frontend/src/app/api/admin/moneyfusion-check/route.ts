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
// **Why it can hand back the payment URL** (`?url=1`): which methods the
// customer is offered is MoneyFusion's decision, taken on their page from the
// number we send — there is no field in their API for it. So the ONLY way to
// learn whether a customer outside the mobile-money zone can pay at all, or
// whether a bank card is offered, is to open that page with a number from
// their country and look. `?phone=` does that. The session has no Order
// behind it, so nothing would be credited if it were paid — which is why the
// URL is withheld unless explicitly asked for, and why the answer says so.
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
  normalisePhone,
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
    // Try another country's number to see what its customers are offered.
    const asked = req.nextUrl.searchParams.get('phone');
    const phone = normalisePhone(asked) ?? '0700000000';
    if (asked && !normalisePhone(asked)) {
      return NextResponse.json(
        { ok: false, error: 'That phone number cannot be one (8 to 15 digits).' },
        { headers },
      );
    }
    const wantsUrl = req.nextUrl.searchParams.get('url') === '1';

    try {
      const res = await moneyfusionCheckout({
        tier: 'decouverte',
        // A number MoneyFusion will accept in shape; nobody is charged.
        phone,
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
          phoneSent: phone,
          // Only when asked. NOTHING is credited if this is ever paid: there
          // is no Order behind it. It is for LOOKING at which methods the
          // page offers this number's country, nothing else.
          ...(wantsUrl
            ? {
                paymentUrl: res.paymentUrl,
                warning:
                  'Diagnostic session with no order behind it — look at the methods offered, never pay it.',
              }
            : {}),
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
