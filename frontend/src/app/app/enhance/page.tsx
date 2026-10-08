// /app/enhance — improve an existing render (sharper, better lit, more
// believable) without redesigning it. Took the rail slot the in-app gallery
// held; that gallery was removed on 2026-10-06 (/app/exemple redirects here).
//
// Opened from a project's command bar it arrives with ?projet=&image=, and
// starts on that image instead of asking for an upload. An Enhance project
// opened from the Projets page (or redirected from /app/[projet]) also
// carries &resultat=, its latest result, shown against the photo. Ownership is not
// checked here: the image proxy and the enhance route both refuse a node the
// caller does not own, so a forged link shows nothing and runs nothing.
import { loadAppSurface } from '../surface-data';
import { EnhanceClient } from './EnhanceClient';

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async function AppEnhancePage({
  searchParams,
}: {
  searchParams: Promise<{
    projet?: string | string[];
    image?: string | string[];
    resultat?: string | string[];
  }>;
}) {
  const [surface, params] = await Promise.all([loadAppSurface('enhance'), searchParams]);
  const projectId = typeof params.projet === 'string' ? params.projet : '';
  const nodeId = typeof params.image === 'string' ? params.image : '';
  const initialSession =
    ID.test(projectId) && ID.test(nodeId) ? { projectId, sourceNodeId: nodeId } : null;
  const resultId = typeof params.resultat === 'string' ? params.resultat : '';
  return (
    <EnhanceClient
      surface={surface}
      initialSession={initialSession}
      initialResultId={initialSession && ID.test(resultId) ? resultId : null}
    />
  );
}
