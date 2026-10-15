import { redirect } from 'next/navigation';
import { isAuthDisabled } from '@/lib/server/auth-disabled';
import { optionalAuth } from '@/lib/server/middleware';
import { isEmailSignInConfigured, PASSWORD_MIN_LENGTH } from '@/lib/server/auth/password';
import { AuthShell } from '../AuthShell';
import { ConnexionForm } from './ConnexionForm';

// /connexion — Google and email + password (2026-10-13). Google shows with
// its three GOOGLE_* variables. Email + password always shows; once Resend
// can send codes, a new account proves its address first and « Mot de passe
// oublié » appears — until then accounts are created at once (2026-10-15).

/** Same-origin path only (no `//host`, no scheme) — the proxy and the
 *  refresh route send `?next=` here. */
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/app';
  return raw.length > 500 ? '/app' : raw;
}

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string }>;
}) {
  // Free-access mode (lib/server/auth-disabled.ts): nobody signs in.
  if (isAuthDisabled()) redirect('/app');

  // A REAL session goes straight in. Checked, not guessed from a cookie:
  // a stale cookie with an expired session must see the form, or /app and
  // /connexion would send the visitor back and forth.
  if (await optionalAuth()) redirect('/app');

  const { next, mode } = await searchParams;
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI,
  );

  return (
    <AuthShell step={1}>
      <ConnexionForm
        googleEnabled={googleEnabled}
        verifyEmail={isEmailSignInConfigured()}
        passwordMin={PASSWORD_MIN_LENGTH}
        next={safeNext(next)}
        initialMode={mode === 'signup' ? 'signup' : 'login'}
      />
    </AuthShell>
  );
}
