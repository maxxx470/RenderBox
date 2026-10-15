// Opens a signed-in session — the same four calls the magic-link and Google
// callbacks make (access + refresh cookies, then the CSRF cookie), in one
// place for the email + password routes. Route Handlers only: cookies can't
// be set while a Server Component renders.
import 'server-only';
import {
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
  setCsrfCookie,
} from '@/lib/server/auth';

export async function issueSession(user: {
  id: string;
  email: string;
  tokenVersion: number;
}): Promise<void> {
  const access = await createAccessToken({
    sub: user.id,
    email: user.email,
    tokenVersion: user.tokenVersion,
  });
  const refresh = await createRefreshToken(user.id, user.tokenVersion);
  await setAuthCookies(access, refresh);
  await setCsrfCookie();
}
