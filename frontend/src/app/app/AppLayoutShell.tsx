import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAuthDisabled } from '@/lib/server/auth-disabled';
import { AppChrome } from './AppChrome';
import { SIDEBAR_COOKIE } from './sidebar-cookie';
import { loadShell } from './shell-data';

/**
 * The server half of the app chrome, shared by the two layouts that wear it
 * (/app/* and /parametres): reads the account, its plan and the rail's folded
 * state, then hands them to AppChrome, which stays mounted while the pages
 * under it change.
 *
 * An account that has not done the onboarding yet is sent to /bienvenue
 * first (owner, 2026-10-13: after sign-in « on tombera sur la page
 * d'onboarding »); the demo user of the free-access mode never is.
 */
export async function AppLayoutShell({ children }: { children: ReactNode }) {
  const [{ auth, quota }, jar] = await Promise.all([loadShell(), cookies()]);
  if (!quota.onboarded && !isAuthDisabled()) redirect('/bienvenue');
  return (
    <AppChrome
      userEmail={auth.user.email ?? ''}
      initialQuota={{ tier: quota.tier, max: quota.max, remaining: quota.remaining }}
      initialCollapsed={jar.get(SIDEBAR_COOKIE)?.value === '1'}
      // The engines' versions run through Kie: without its key the routes
      // use the direct APIs and no version chip is shown.
      versionsEnabled={Boolean(process.env.KIE_API_KEY)}
    >
      {children}
    </AppChrome>
  );
}
