// Single source of truth for the output resolution offered in the command
// bar — the "1K / 2K / 4K" control, with the rough time each one costs.
//
// Like ratios.ts this is deliberately NOT `server-only`: the command bar is a
// client component and enumerates these to build its selector.
//
// Every size is available on both engines since 2026-10-08 (owner: there is
// no free mode, a paying user gets everything):
//   • Visio runs on Gemini's Pro image model, which takes an `imageSize` of
//     1K / 2K / 4K and renders at that size (see engines/nanobanana.ts);
//   • Pixel IA (gpt-image-1) tops out around 1536px, so its image is enlarged
//     to the size asked for afterwards (see output-shape.ts) — the same
//     happens to Visio if the Pro model is ever unavailable and the call falls
//     back to the Flash one.

export const RESOLUTION_KEYS = ['1k', '2k', '4k'] as const;

export type ResolutionKey = (typeof RESOLUTION_KEYS)[number];

export interface ResolutionSpec {
  /** Shown as-is — "1K" needs no translation. */
  label: string;
  /** Roughly how long a generation at this size takes, in seconds. */
  etaSeconds: number;
  /** `imageConfig.imageSize` for Gemini's Pro image model. */
  gemini: '1K' | '2K' | '4K';
  /** The long edge, in pixels, the delivered image must reach. */
  longEdge: number;
}

export const RESOLUTIONS: Record<ResolutionKey, ResolutionSpec> = {
  '1k': { label: '1K', etaSeconds: 25, gemini: '1K', longEdge: 1024 },
  '2k': { label: '2K', etaSeconds: 35, gemini: '2K', longEdge: 2048 },
  '4k': { label: '4K', etaSeconds: 50, gemini: '4K', longEdge: 4096 },
};

export const DEFAULT_RESOLUTION: ResolutionKey = '1k';

export function isResolutionKey(value: string): value is ResolutionKey {
  return (RESOLUTION_KEYS as readonly string[]).includes(value);
}
