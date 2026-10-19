import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from '@/lib/csp';
import { COOKIE_PREFIX as LOCALE_COOKIE_PREFIX } from '@/lib/constants';

// Silent-refresh gate for protected pages.
//
// The (15-min) access cookie can expire while a (7-day) refresh cookie is
// still valid — typically when a tab sat unfocused or the laptop slept. The
// (authed) layout calling /api/auth/me would 401 and the user would be kicked
// to /login. This proxy catches that case BEFORE the page renders and
// bounces the request through /api/auth/refresh-and-return, which mints fresh
// cookies and 302s back to the original URL — invisible to the user.
//
// Protected paths: AUTH_PROTECTED_PREFIXES (comma-separated) or, since
// 2026-10-13 (RenderPro turns real sign-in back on), RenderPro's own pages by
// default — the app, Paramètres, the onboarding and the back-office. While
// AUTH_DISABLED=true nothing is protected (the demo user needs no session).
//
// The refresh cookie is path-scoped to /api/auth, so a page request never
// carries it: the session hint read here is the CSRF cookie (path /, same
// 7-day life). /api/auth/refresh-and-return then reads the real refresh
// cookie and falls back to the sign-in page if it is gone or invalid.
//
// Edge runtime: no DB, no bcrypt, no Prisma. We only inspect cookies and
// build redirects — the heavy lifting happens in /api/auth/refresh-and-return
// (runtime=nodejs).

const COOKIE_PREFIX = process.env.COOKIE_PREFIX || 'app';
const ACCESS_COOKIE = `${COOKIE_PREFIX}-token`;
const CSRF_COOKIE = `${COOKIE_PREFIX}-csrf`;
// Named as the locale code names it (lib/constants, LocaleContext, layout).
const LOCALE_COOKIE = `${LOCALE_COOKIE_PREFIX}-locale`;
const DEFAULT_PROTECTED = '/app,/parametres,/bienvenue,/admin';

// Read per request (not at module load) so the switch takes effect as set.
function authedPrefixes(): string[] {
  if (process.env.AUTH_DISABLED === 'true') return [];
  return (process.env.AUTH_PROTECTED_PREFIXES || DEFAULT_PROTECTED)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAuthedPath(prefixes: string[], pathname: string): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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

// The old address leads to the domain (2026-10-19): one address for every
// visitor, so a Google sign-in started on one ends on the same one. Pages
// only — the matcher leaves /api alone, so calls and webhooks made out to the
// old address keep working.
const LEGACY_HOSTS = new Set(['renderbox-app.vercel.app']);
const CANONICAL_ORIGIN = 'https://www.renderpro.app';

export function proxy(req: NextRequest): NextResponse {
  if (LEGACY_HOSTS.has(req.headers.get('host') ?? '')) {
    const { pathname, search } = req.nextUrl;
    return NextResponse.redirect(new URL(pathname + search, CANONICAL_ORIGIN), 308);
  }

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

  // `?lang=fr|en` (2026-10-18, lib/seo.ts): each language's own address, for
  // search engines and shared links. It is the visitor's choice, as a click
  // on FR / EN would be: the page is served in it now and the cookie keeps it.
  const lang = req.nextUrl.searchParams.get('lang');
  const askedLocale = lang === 'fr' || lang === 'en' ? lang : null;
  if (askedLocale) {
    const others = (req.headers.get('cookie') ?? '')
      .split(';')
      .map((c) => c.trim())
      .filter((c) => c && !c.startsWith(`${LOCALE_COOKIE}=`));
    requestHeaders.set('cookie', [...others, `${LOCALE_COOKIE}=${askedLocale}`].join('; '));
  }

  const nextResponse = () => NextResponse.next({ request: { headers: requestHeaders } });

  const res = ((): NextResponse => {
    const prefixes = authedPrefixes();
    if (prefixes.length === 0) return nextResponse();

    const { pathname, search } = req.nextUrl;
    if (!isAuthedPath(prefixes, pathname)) return nextResponse();
    if (req.cookies.get(ACCESS_COOKIE)?.value) return nextResponse();

    const target = pathname + search;
    const url = req.nextUrl.clone();

    if (!req.cookies.get(CSRF_COOKIE)?.value) {
      url.pathname = process.env.AUTH_LOGIN_PATH || '/connexion';
      url.search = `?next=${encodeURIComponent(target)}`;
      return NextResponse.redirect(url, 303);
    }

    url.pathname = '/api/auth/refresh-and-return';
    url.search = `?next=${encodeURIComponent(target)}`;
    return NextResponse.redirect(url, 303);
  })();

  res.headers.set(csp.headerName, csp.policy);
  ensureCsrfCookieWhenAuthDisabled(req, res);
  if (askedLocale) {
    // Same cookie as LocaleContext's FR / EN switch (read by JS too).
    res.cookies.set(LOCALE_COOKIE, askedLocale, {
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
      sameSite: 'lax',
    });
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)'],
};
