// Single source of truth for the output aspect ratios offered before a
// generation. Deliberately NOT `server-only`: the command bar (a client
// component) enumerates these to build its selector, exactly as it already
// does with PRESET_KEYS and ENGINE_NAMES.
//
// The two engines express the same idea differently — Gemini takes a ratio
// string, gpt-image-1 takes one of three fixed pixel sizes — so each entry
// carries both, and `null` means "this engine cannot produce this ratio".
// Nothing here approximates: offering 16:9 on an engine that would silently
// return 3:2 turns a control into a lie. Ratios an engine cannot honour are
// disabled in the UI and refused by the route.
import type { EngineName } from './engines/types';

export const RATIO_KEYS = ['auto', '1:1', '3:2', '2:3', '16:9', '9:16'] as const;

export type RatioKey = (typeof RATIO_KEYS)[number];

/** The three sizes gpt-image-1's edit endpoint accepts. */
type OpenAiSize = '1024x1024' | '1536x1024' | '1024x1536';

export interface RatioSpec {
  /** Shown as-is in the UI — a ratio needs no translation. */
  label: string;
  /** `config.imageConfig.aspectRatio` for Gemini, null when unsupported. */
  gemini: string | null;
  /** `size` for the OpenAI edit call, null when unsupported. */
  openai: OpenAiSize | null;
}

export const RATIOS: Record<RatioKey, RatioSpec> = {
  // The default. Sends nothing to either engine, so the output keeps the
  // framing the engine would have chosen from the source image — which is
  // what every generation did before this control existed.
  auto: { label: 'Auto', gemini: null, openai: null },
  '1:1': { label: '1:1', gemini: '1:1', openai: '1024x1024' },
  '3:2': { label: '3:2', gemini: '3:2', openai: '1536x1024' },
  '2:3': { label: '2:3', gemini: '2:3', openai: '1024x1536' },
  // Gemini-only: gpt-image-1 has no 16:9 size, and 1536x1024 is 3:2.
  '16:9': { label: '16:9', gemini: '16:9', openai: null },
  '9:16': { label: '9:16', gemini: '9:16', openai: null },
};

/**
 * Whether an engine can actually produce this ratio. 'auto' is always
 * supported — it asks for nothing.
 */
export function isRatioSupported(ratio: RatioKey, engine: EngineName): boolean {
  if (ratio === 'auto') return true;
  const spec = RATIOS[ratio];
  return engine === 'nanobanana' ? spec.gemini !== null : spec.openai !== null;
}

/** The ratios an engine can honour, in declaration order. */
export function supportedRatios(engine: EngineName): RatioKey[] {
  return RATIO_KEYS.filter((r) => isRatioSupported(r, engine));
}
