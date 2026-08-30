// Temporary, site-wide auth kill-switch for the "under construction, already
// deployed publicly" period — replaces the previous NODE_ENV-gated dev-only
// bypass (removed). AUTH_DISABLED=true lets every visitor use /app as a
// fixed demo user with no login at all, on the LIVE Vercel deployment, not
// just in local dev — so this is deliberately NOT conditioned on NODE_ENV.
//
// /admin is never affected: requireAdmin/requireSuperadmin
// (lib/server/middleware/index.ts) resolve real cookie/session auth
// directly and never consult isAuthDisabled() — only requireAuth/
// optionalAuth (used by /app and its API routes) do.
//
// To turn normal auth back on when the site is ready: remove AUTH_DISABLED
// from Vercel's env vars (or set it to anything but "true") and redeploy.
// No code change needed.
//
// The fake session resolves to a REAL User row (seeded by scripts/seed-dev.ts
// with this exact id, role USER, a test tier pre-assigned so generation isn't
// blocked) so every IDOR check and the tier-quota gate elsewhere in the app
// keep working unmodified — there is no special-cased "fake user" path
// outside of auth resolution itself.
//
// Deliberately NOT tagged `server-only` — scripts/seed-dev.ts (run via tsx,
// outside Next's bundler) imports the constants below directly to seed the
// matching User row, and the `server-only` package throws unconditionally
// outside a Next.js server-component bundle (it only resolves to a no-op via
// the "react-server" export condition that tsx doesn't set).

export const AUTH_DISABLED_USER_ID = 'auth-disabled-demo-user';
export const AUTH_DISABLED_USER_EMAIL = 'demo@localhost';

export function isAuthDisabled(): boolean {
  return process.env.AUTH_DISABLED === 'true';
}

// Single source of truth for "where does the primary CTA point right now" —
// used by the landing page and /connexion so nothing hardcodes /connexion
// individually.
export function getAuthCta(): '/app' | '/connexion' {
  return isAuthDisabled() ? '/app' : '/connexion';
}
