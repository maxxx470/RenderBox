// Single source of truth for the output resolution offered in the command
// bar — the "1K / 2K / 4K" control, with the rough time each one costs.
//
// Like ratios.ts this is deliberately NOT `server-only`: the command bar is a
// client component and enumerates these to build its selector.
//
// ---------------------------------------------------------------------------
// What each engine can actually honour
// ---------------------------------------------------------------------------
// Both entries below are read off what the adapters really send, not off what
// the models are believed to be able to do:
//
//   • nanobanana → `gemini-2.5-flash-image`, which returns a ~1024px image and
//     takes no size parameter at all (its `imageConfig` accepts `aspectRatio`
//     and nothing else). Larger outputs need a different model — Gemini's
//     Pro image line takes an `imageSize` of 1K/2K/4K — and that is a change
//     to nanobanana.ts plus a price, not a change to this table.
//   • gpt_image → `gpt-image-1`, whose edit endpoint accepts exactly three
//     sizes, all in the 1024–1536px range. There is no 2K and no 4K.
//
// So 2K and 4K are listed and disabled, with the same treatment ratios.ts
// already uses for a ratio an engine cannot produce: shown, greyed, badged.
// The alternative — accepting the click and silently returning 1024px — is
// the kind of control that turns the whole bar into decoration.
//
// THE DAY EITHER ENGINE GAINS A SIZE: flip the flags here and pass
// `RESOLUTIONS[key].gemini` (or `.openai`) through the adapter. This file is
// the only place the UI reads.
import type { EngineName } from './engines/types';

export const RESOLUTION_KEYS = ['1k', '2k', '4k'] as const;

export type ResolutionKey = (typeof RESOLUTION_KEYS)[number];

export interface ResolutionSpec {
  /** Shown as-is — "1K" needs no translation. */
  label: string;
  /** Roughly how long a generation at this size takes, in seconds. */
  etaSeconds: number;
  /** `imageConfig.imageSize` for Gemini, null when the model has none. */
  gemini: string | null;
  /** True when gpt-image-1 has a `size` in this range. */
  openai: boolean;
}

export const RESOLUTIONS: Record<ResolutionKey, ResolutionSpec> = {
  // What both engines produce today, and the only entry either can honour.
  '1k': { label: '1K', etaSeconds: 25, gemini: null, openai: true },
  '2k': { label: '2K', etaSeconds: 35, gemini: null, openai: false },
  '4k': { label: '4K', etaSeconds: 45, gemini: null, openai: false },
};

export const DEFAULT_RESOLUTION: ResolutionKey = '1k';

/** Whether the engine can really return an image at this size. */
export function isResolutionSupported(resolution: ResolutionKey, engine: EngineName): boolean {
  const spec = RESOLUTIONS[resolution];
  return engine === 'nanobanana' ? spec.gemini !== null || resolution === '1k' : spec.openai;
}

/** The resolutions an engine can honour, in declaration order. */
export function supportedResolutions(engine: EngineName): ResolutionKey[] {
  return RESOLUTION_KEYS.filter((r) => isResolutionSupported(r, engine));
}
