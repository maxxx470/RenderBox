// Single source of truth for the output aspect ratios offered before a
// generation. Deliberately NOT `server-only`: the command bar (a client
// component) enumerates these to build its selector, exactly as it already
// does with PRESET_KEYS and ENGINE_NAMES.
//
// Every ratio is available on both engines since 2026-10-08 (owner: there is
// no free mode, a paying user gets everything). Each engine reaches it its
// own way, and the result is the ratio asked for, never an approximation:
//   • Visio (Gemini's image models) takes the ratio string as is;
//   • Pixel IA (gpt-image-1) only knows three pixel sizes, so it is asked for
//     the nearest one and the image is cropped to the exact ratio afterwards
//     (see output-shape.ts).
export const RATIO_KEYS = [
  'auto',
  '1:1',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '16:9',
  '9:16',
  '5:4',
  '4:5',
  '21:9',
] as const;

export type RatioKey = (typeof RATIO_KEYS)[number];

/** The three sizes gpt-image-1's edit endpoint accepts. */
type OpenAiSize = '1024x1024' | '1536x1024' | '1024x1536';

export interface RatioSpec {
  /** Shown as-is in the UI — a ratio needs no translation. */
  label: string;
  /** Width over height, null for 'auto'. */
  value: number | null;
  /** `config.imageConfig.aspectRatio` for Gemini, null for 'auto'. */
  gemini: string | null;
  /** The gpt-image-1 size to ask for before cropping, null for 'auto'. */
  openai: OpenAiSize | null;
}

/** The gpt-image-1 size whose shape is closest to a ratio. */
function nearestOpenAiSize(value: number): OpenAiSize {
  // Boundaries halfway (geometrically) between 2:3, 1:1 and 3:2.
  if (value >= Math.sqrt(1.5)) return '1536x1024';
  if (value <= 1 / Math.sqrt(1.5)) return '1024x1536';
  return '1024x1024';
}

function spec(key: Exclude<RatioKey, 'auto'>): RatioSpec {
  const [w, h] = key.split(':').map(Number) as [number, number];
  const value = w / h;
  return { label: key, value, gemini: key, openai: nearestOpenAiSize(value) };
}

export const RATIOS: Record<RatioKey, RatioSpec> = {
  // The default. Sends nothing to either engine, so the output keeps the
  // framing the engine would have chosen from the source image — which is
  // what every generation did before this control existed.
  auto: { label: 'Auto', value: null, gemini: null, openai: null },
  '1:1': spec('1:1'),
  '4:3': spec('4:3'),
  '3:4': spec('3:4'),
  '3:2': spec('3:2'),
  '2:3': spec('2:3'),
  '16:9': spec('16:9'),
  '9:16': spec('9:16'),
  '5:4': spec('5:4'),
  '4:5': spec('4:5'),
  '21:9': spec('21:9'),
};

export function isRatioKey(value: string): value is RatioKey {
  return (RATIO_KEYS as readonly string[]).includes(value);
}
