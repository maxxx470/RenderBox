import 'server-only';
import { cache } from 'react';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getCreditStatus } from '@/lib/server/generation/tier-quota';

/**
 * The signed-in user and their plan, read once per request.
 *
 * Both the app layout (the header and the rail, see AppChrome) and the page
 * under it need these. `cache` dedupes the two calls inside one server
 * render, so a first load still costs a single auth check and a single
 * credits read — DATABASE_URL pins `connection_limit=1`, every extra query is a full
 * serial round trip. On a client-side navigation only the page renders (the
 * layout stays mounted), so only the page's call runs.
 *
 * `getCreditStatus` reads without spending, and is also what clears a lapsed
 * period (its credits expire), so opening any app page keeps the plan honest.
 *
 * Redirects to /connexion: these are pages, and a signed-out visitor wants
 * the sign-in screen, not a 401 body.
 */
export const loadShell = cache(async () => {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) {
    redirect('/connexion');
  }
  const quota = await getCreditStatus(prisma, auth.user.sub);
  return { auth, quota };
});
