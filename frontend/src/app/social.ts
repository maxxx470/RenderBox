// Social links shown in the public footer.
//
// Rendered only when set — an inert or invented link is worse than none.
// Same rule as DASHBOARD_VIDEO in app/dashboard-media.ts. The addresses live
// in lib/community-links.ts, the single source shared with the in-app Info
// page.
import { TIKTOK_ACCOUNT } from '@/lib/community-links';

export const SOCIAL: { tiktok: string | null } = {
  tiktok: TIKTOK_ACCOUNT,
};
