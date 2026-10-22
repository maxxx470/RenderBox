'use client';

import { offeredPrice } from '@/lib/provider-cost';
import type { EngineName } from '@/lib/server/generation/engines/types';
import type { ResolutionKey } from '@/lib/server/generation/resolutions';

/**
 * The credits a render will cost, for the send button and the check before
 * sending: the grid's price of the engine at that size (provider-cost.ts), the
 * same for everyone since 2026-10-22, plus `analysis` — what the Claude
 * analysis that comes first adds (`analysisPrice`, `ANALYSIS_COST`), already
 * in the one price shown. Display only — the server prices the request itself.
 */
export function useRenderPrice() {
  return (engine: EngineName, resolution: ResolutionKey, count = 1, analysis = 0) =>
    offeredPrice(engine, resolution, count) + analysis;
}
