// /parametres — the account page, inside the workspace frame.
//
// A server component only because the rail needs the plan and the remaining
// quota; everything visible is in ParametresClient.
import { loadAppSurface } from '@/app/app/surface-data';
import { ParametresClient } from './ParametresClient';

export default async function ParametresPage() {
  const surface = await loadAppSurface('settings');
  return <ParametresClient surface={surface} />;
}
