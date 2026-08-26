// GET /api/auth/magic-link/verify — the emailed link points directly here
// (not at a page). Next.js Server Components can't set cookies during
// render (only Server Actions and Route Handlers can), so unlike the plan
// sketch of a "/connexion/verifier page that verifies itself", the actual
// click target has to be a Route Handler: verify → issue cookies → 302.
// Mirrors the old verify-email/oauth-callback pattern exactly.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { verifyMagicLink } from '@/lib/server/auth/verify-magic-link';
import {
  setAuthCookies,
  setCsrfCookie,
  createAccessToken,
  createRefreshToken,
} from '@/lib/server/auth';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const appUrl = process.env.APP_URL || req.nextUrl.origin;
    const url = req.nextUrl;
    const token = url.searchParams.get('token');
    const email = url.searchParams.get('email');

    if (!token || !email) {
      return NextResponse.redirect(`${appUrl}/connexion?magicLinkError=invalid`, 302);
    }

    const result = await verifyMagicLink(email, token);
    if (!result.ok) {
      const code = result.error === 'MAGIC_LINK_EXPIRED' ? 'expired' : 'invalid';
      return NextResponse.redirect(`${appUrl}/connexion?magicLinkError=${code}`, 302);
    }

    const access = await createAccessToken({
      sub: result.userId,
      email: result.email,
      tokenVersion: result.tokenVersion,
    });
    const refresh = await createRefreshToken(result.userId, result.tokenVersion);
    await setAuthCookies(access, refresh);
    await setCsrfCookie();

    log.info('magic-link/verify: success', { userId: result.userId });
    return NextResponse.redirect(`${appUrl}/app`, 302);
  });
}
