// /app/tarifs — the landing's pricing, inside the app.
//
// Every "choose a plan" button in the workspace used to point at /#tarifs,
// which dropped a signed-in user back onto the marketing page, rail gone.
// Once inside, nothing links out to the landing any more; this page carries
// the same three tiers (same PricingCard) and starts the same checkout.
import { isAuthDisabled } from '@/lib/server/auth-disabled';
import { loadAppSurface } from '../surface-data';
import { TarifsClient } from './TarifsClient';

export default async function AppTarifsPage() {
  const surface = await loadAppSurface('pricing');
  return <TarifsClient surface={surface} demo={isAuthDisabled()} />;
}
