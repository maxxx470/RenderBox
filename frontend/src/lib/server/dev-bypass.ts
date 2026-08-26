// Dev-only auth bypass — lets /app and its API routes be exercised without
// going through /connexion while iterating on Phases 3/4/5. Only ever active
// when BOTH NODE_ENV=development AND DEV_BYPASS_AUTH=true are set (checked
// together in requireAuth/optionalAuth, lib/server/middleware/index.ts) —
// a stray DEV_BYPASS_AUTH=true in a preview/prod env var is inert there
// because NODE_ENV won't be "development".
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
  return process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true';
}
