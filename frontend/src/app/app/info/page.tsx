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
import { InfoClient } from './InfoClient';

export default async function AppInfoPage() {
  const surface = await loadAppSurface('info');
  return <InfoClient surface={surface} />;
}
