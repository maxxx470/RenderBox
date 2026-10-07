import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { AppChrome } from './AppChrome';
import { SIDEBAR_COOKIE } from './sidebar-cookie';
import { loadShell } from './shell-data';

/**
 * The server half of the app chrome, shared by the two layouts that wear it
 * (/app/* and /parametres): reads the account, its plan and the rail's folded
 * state, then hands them to AppChrome, which stays mounted while the pages
 * under it change.
 */
export async function AppLayoutShell({ children }: { children: ReactNode }) {
  const [{ auth, quota }, jar] = await Promise.all([loadShell(), cookies()]);
  return (
    <AppChrome
      userEmail={auth.user.email ?? ''}
      initialQuota={{ tier: quota.tier, max: quota.max, remaining: quota.remaining }}
      initialCollapsed={jar.get(SIDEBAR_COOKIE)?.value === '1'}
    >
      {children}
    </AppChrome>
  );
}
