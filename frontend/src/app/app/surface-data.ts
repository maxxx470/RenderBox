import 'server-only';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { checkTierQuota } from '@/lib/server/generation/tier-quota';
import type { AppSurfaceProps } from './AppSurface';
import type { RailPage } from './HomeSidebar';

/**
 * Everything the workspace frame needs, in ONE database round trip.
 *
 * DATABASE_URL pins `connection_limit=1` (Neon serverless tuning), so Prisma
 * holds a single connection and every query is a serial round trip added to
 * the page's time to first byte. The rail shows the plan and the remaining
 * quota, and `checkTierQuota` with `count: 0` reads both without consuming
 * anything — and, by design, is also what clears a lapsed period, so simply
 * opening one of these pages keeps the displayed plan honest.
 *
 * Redirects to /connexion rather than returning the 401 body: these are
 * pages, not API routes, and a signed-out visitor wants the sign-in screen.
 */
export async function loadAppSurface(current: RailPage): Promise<AppSurfaceProps> {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) {
    redirect('/connexion');
  }

  const quota = await checkTierQuota(prisma, auth.user.sub, 0);

  return {
    current,
    tier: quota.tier,
    quotaMax: quota.max,
    quotaRemaining: quota.remaining,
    userEmail: auth.user.email ?? '',
  };
}
