'use client';

import { useAuth } from '@/contexts/AuthContext';
import { renderPrice } from '@/lib/provider-cost';
import type { EngineName } from '@/lib/server/generation/engines/types';
import type { ResolutionKey } from '@/lib/server/generation/resolutions';

/**
 * The credits a render will cost this account, for the send button and the
 * check before sending: Kie's price for an administrator (2026-10-18), 50 /
 * 70 for everyone else. Display only — the server prices the request itself.
 */
export function useRenderPrice() {
  const { user } = useAuth();
  const role = user?.role;
  return (engine: EngineName, resolution: ResolutionKey, count = 1) =>
    renderPrice(role, engine, resolution, count);
}
