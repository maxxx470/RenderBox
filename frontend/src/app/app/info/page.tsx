// /app/info — the in-app Informations page.
//
// Its public twin is /info, which shows the same announcements wearing the
// landing's header. This one wears the workspace rail, so opening
// Informations from inside the app no longer throws the workspace away.
//
// The page itself is a server component only because the rail needs the plan
// and the quota; the frame and the list are client components, which is why
// the titles are resolved one level down rather than here.
import { loadAppSurface } from '../surface-data';
import { loadShell } from '../shell-data';
import { InfoClient } from './InfoClient';

export default async function AppInfoPage() {
  // loadShell is cached: the same read as the frame's, no second query.
  const [surface, { quota }] = await Promise.all([loadAppSurface('info'), loadShell()]);
  // Read before the visit is recorded (AppChrome does it once the page is
  // shown), so the films new since the last visit wear « Nouveau » now.
  return <InfoClient surface={surface} since={quota.infoSince?.toISOString() ?? null} />;
}
