import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from '@/lib/csp';

// Silent-refresh gate for protected pages.
//
// The (15-min) access cookie can expire while a (7-day) refresh cookie is
// still valid — typically when a tab sat unfocused or the laptop slept. The
// (authed) layout calling /api/auth/me would 401 and the user would be kicked
// to /login. This middleware catches that case BEFORE the page renders and
// bounces the request through /api/auth/refresh-and-return, which mints fresh
// cookies and 302s back to the original URL — invisible to the user.
//
// Protected paths are configured via AUTH_PROTECTED_PREFIXES (comma-separated,
// e.g. "/dashboard,/account"). Empty by default — the API surface is the only
// thing shipped, so out-of-the-box this middleware is a no-op.
//
// Edge runtime: no DB, no bcrypt, no Prisma. We only inspect cookies and
// build redirects — the heavy lifting happens in /api/auth/refresh-and-return
// (runtime=nodejs).

const COOKIE_PREFIX = process.env.COOKIE_PREFIX || 'app';
const ACCESS_COOKIE = `${COOKIE_PREFIX}-token`;
const REFRESH_COOKIE = `${COOKIE_PREFIX}-refresh`;
const CSRF_COOKIE = `${COOKIE_PREFIX}-csrf`;
const LOGIN_PATH = process.env.AUTH_LOGIN_PATH || '/login';

const AUTHED_PREFIXES = (process.env.AUTH_PROTECTED_PREFIXES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAuthedPath(pathname: string): boolean {
  return AUTHED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// AUTH_DISABLED (see lib/server/auth-disabled.ts) skips the login flow
// entirely, so the browser never gets the JS-readable CSRF cookie that flow
// normally issues — without it, every mutating request (generate, edit,
// upload, create project) would be silently rejected by verifyCsrf, and
// AuthContext would never even call /api/auth/me (it uses this cookie's
// presence as its "has a session" signal). Minting it here, once per
// browser, on the first page load keeps that whole double-submit pattern
// working with zero change to the protected auth.ts/api.ts/middleware
// modules that actually enforce it.
function ensureCsrfCookieWhenAuthDisabled(req: NextRequest, res: NextResponse): void {
  if (process.env.AUTH_DISABLED !== 'true') return;
  if (req.cookies.get(CSRF_COOKIE)?.value) return;
  res.cookies.set(CSRF_COOKIE, crypto.randomUUID(), {
    httpOnly: false, // must be readable by JS — same contract as auth.ts's setCsrfCookie
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
}

export function middleware(req: NextRequest): NextResponse {
  const csp = buildCsp({
    nonce: crypto.randomUUID(),
    isProduction: process.env.NODE_ENV === 'production',
    enforce: process.env.CSP_ENFORCE === 'true',
    sentryDsn: process.env.SENTRY_DSN,
  });

  // Next reads the nonce off the REQUEST's Content-Security-Policy header to
  // stamp its own inline bootstrap script. It is set even in report-only mode
  // on purpose: without it the reports would flag Next's own scripts, which
  // enforcement would in fact have allowed — noise that hides real findings.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', csp.nonce);
  requestHeaders.set('Content-Security-Policy', csp.policy);

  const nextResponse = () => NextResponse.next({ request: { headers: requestHeaders } });

  const res = ((): NextResponse => {
    if (AUTHED_PREFIXES.length === 0) return nextResponse();

    const { pathname, search } = req.nextUrl;
    if (!isAuthedPath(pathname)) return nextResponse();
    if (req.cookies.get(ACCESS_COOKIE)?.value) return nextResponse();

    const target = pathname + search;
    const url = req.nextUrl.clone();

    if (!req.cookies.get(REFRESH_COOKIE)?.value) {
      url.pathname = LOGIN_PATH;
      url.search = `?next=${encodeURIComponent(target)}`;
      return NextResponse.redirect(url, 303);
    }

    url.pathname = '/api/auth/refresh-and-return';
    url.search = `?next=${encodeURIComponent(target)}`;
    return NextResponse.redirect(url, 303);
  })();

  res.headers.set(csp.headerName, csp.policy);
  ensureCsrfCookieWhenAuthDisabled(req, res);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)'],
};
