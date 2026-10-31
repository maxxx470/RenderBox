export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';
import { readUnsubscribeToken } from '@/lib/server/reengagement/unsubscribe-token';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();

/**
 * Unsubscribing from the relances (2026-10-31).
 *
 * NO CSRF TOKEN HERE, and that is deliberate — the one exception to the
 * project's rule. RFC 8058 one-click unsubscribe is a POST sent by Gmail or
 * Outlook itself, from no session and no page of ours; a CSRF check would
 * make it fail, and a sender whose unsubscribe fails is a sender those two
 * put in the spam folder. What stands in for the session is the signed
 * token in the link (unsubscribe-token.ts, HMAC on JWT_SECRET): it is
 * unguessable and it can do exactly one thing — stop the relances for that
 * one account. It cannot sign in, read anything, or change anything else,
 * so the worst a forged request could achieve is what the link is for.
 *
 * GET is the human clicking the link; POST is the mail client's one-click.
 * Both are idempotent. Neither ever silences the e-mails the account NEEDS
 * (sign-in codes, receipts): those are not relances.
 */
async function unsubscribe(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const token = new URL(req.url).searchParams.get('token');
    const secret = process.env.JWT_SECRET;
    const userId = token && secret ? readUnsubscribeToken(token, secret) : null;

    if (userId) {
      // updateMany: a token naming a deleted account must not throw.
      const { count } = await prisma.user.updateMany({
        where: { id: userId, marketingUnsubscribedAt: null },
        data: { marketingUnsubscribedAt: new Date() },
      });
      if (count > 0) log.info('reengagement: unsubscribed', { userId, requestId: ctx.requestId });
    } else {
      log.warn('reengagement: unsubscribe token refused', { requestId: ctx.requestId });
    }

    // The answer never says whether the token was good: same page either
    // way, so the link cannot be used to probe for accounts.
    if (req.method === 'POST') {
      return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
    }
    const lang = new URL(req.url).searchParams.get('lang') === 'fr' ? 'fr' : 'en';
    return NextResponse.redirect(new URL(`/desabonnement?lang=${lang}`, req.url), {
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return unsubscribe(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return unsubscribe(req);
}
