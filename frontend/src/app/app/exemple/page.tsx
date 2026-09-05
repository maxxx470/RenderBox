// /app/exemple — the in-app gallery.
//
// Its public twin is /exemple, which groups the same renders by ambiance and
// explains the materials sheet: a visitor there is being taught what the five
// ambiances are. Someone already inside the product is not — they are looking
// for what the thing can produce, so this is one flat wall of images.
import { loadAppSurface } from '../surface-data';
import { ExempleClient } from './ExempleClient';

export default async function AppExemplePage() {
  const surface = await loadAppSurface('examples');
  return <ExempleClient surface={surface} />;
}
