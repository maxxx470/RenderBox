// Auth bypass — lets /app and its API routes be exercised without going
// through /connexion. Requires DEV_BYPASS_AUTH=true in all cases.
//
// Two activation paths:
//   - Local dev: DEV_BYPASS_AUTH=true + NODE_ENV=development (the default
//     `next dev` value) — always available, no second flag needed.
//   - Any other environment (Vercel preview/production): ALSO requires
//     AUTH_BYPASS_ALLOW_PROD=true as an explicit second opt-in, so a stray
//     DEV_BYPASS_AUTH=true left in a shared env file can't silently open the
//     app up. This is a deliberate, temporary, user-requested override —
//     see renderbox_feedback memory for when it was turned on and why.
//
// The fake session resolves to a REAL User row (seeded by scripts/seed-dev.ts
// with this exact id) so every IDOR check elsewhere in the app
// (`project.userId === session.userId`) keeps working unmodified — there is
// no special-cased "fake user" path outside of auth resolution itself.
//
// Deliberately NOT tagged `server-only` — scripts/seed-dev.ts (run via tsx,
// outside Next's bundler) imports these constants directly to seed the
// matching User row, and the `server-only` package throws unconditionally
// outside a Next.js server-component bundle (it only resolves to a no-op via
// the "react-server" export condition that tsx doesn't set).

export const DEV_FAKE_USER_ID = 'dev-bypass-fake-user';
export const DEV_FAKE_USER_EMAIL = 'dev-bypass@localhost';

export function isDevBypassActive(): boolean {
  if (process.env.DEV_BYPASS_AUTH !== 'true') return false;
  return process.env.NODE_ENV === 'development' || process.env.AUTH_BYPASS_ALLOW_PROD === 'true';
}
