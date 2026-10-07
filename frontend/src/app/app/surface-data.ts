import 'server-only';
import type { AppSurfaceProps } from './AppSurface';
import type { RailPage } from './HomeSidebar';
import { loadShell } from './shell-data';

/**
 * Everything the workspace frame needs: the account and its plan. Shared with
 * the app layout through `loadShell`, so a first load reads them once.
 */
export async function loadAppSurface(current: RailPage): Promise<AppSurfaceProps> {
  const { auth, quota } = await loadShell();
  return {
    current,
    tier: quota.tier,
    quotaMax: quota.max,
    quotaRemaining: quota.remaining,
    userEmail: auth.user.email ?? '',
  };
}
