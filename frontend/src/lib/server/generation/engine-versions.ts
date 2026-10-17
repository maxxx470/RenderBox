// The versions of each engine (owner, 2026-10-15: « chaque version du
// fournisseur devient une version numérotée sous notre nom »). Visio's are the
// Nano Banana family, Pixel IA's the GPT Image family, both reached through
// Kie (engines/kie.ts). The vendor's model is never shown: the UI says
// « Visio 2.1 », not the model id.
//
// Deliberately NOT server-only (same reasoning as engine-labels.ts): the
// command bar lists these. No secret here — only what each Kie model accepts,
// read from docs.kie.ai on 2026-10-15.
import type { EngineName } from './engines/types';
import { ENGINE_LABELS } from './engine-labels';

export const ENGINE_VERSION_KEYS = [
  'visio-1',
  'visio-pro',
  'visio-2',
  'visio-2-1',
  'visio-2-lite',
  'pixel-1-5',
  'pixel-2',
  'pixel-2-5',
] as const;

export type EngineVersionKey = (typeof ENGINE_VERSION_KEYS)[number];

export interface EngineVersion {
  engine: EngineName;
  name: { fr: string; en: string };
  description: { fr: string; en: string };
  /** The Kie market model id (image-to-image). */
  kieModel: string;
  /** Where the input image URLs go in the model's `input`. */
  imageField: 'image_input' | 'image_urls' | 'input_urls';
  /** How many input images the model takes (source + references). */
  maxImages: number;
  /** The ratios the model takes; ours outside it go to the nearest one. */
  ratios: readonly string[];
  /** The model refuses a missing ratio and has no 'auto'. */
  ratioRequired: boolean;
  /** The model takes `resolution` (1K / 2K / 4K); otherwise it renders ~1K. */
  resolution: boolean;
  /** Ratios the model refuses at a given size. */
  ratioLimits?: Partial<Record<'1K' | '2K' | '4K', readonly string[]>>;
  /** Fixed extra input fields (output format, quality). */
  extra?: Record<string, string>;
}

// Every ratio the command bar offers (ratios.ts) bar 'auto'.
const OUR_RATIOS = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '5:4', '4:5', '21:9'];

export const ENGINE_VERSIONS: Record<EngineVersionKey, EngineVersion> = {
  'visio-1': {
    engine: 'nanobanana',
    name: { fr: 'Visio 1', en: 'Visio 1' },
    description: { fr: 'Le premier Visio, rapide', en: 'The first Visio, fast' },
    kieModel: 'google/nano-banana-edit',
    imageField: 'image_urls',
    maxImages: 10,
    ratios: [...OUR_RATIOS, 'auto'],
    ratioRequired: false,
    resolution: false,
    extra: { output_format: 'png' },
  },
  'visio-pro': {
    engine: 'nanobanana',
    name: { fr: 'Visio Pro', en: 'Visio Pro' },
    description: { fr: 'Haute définition, jusqu’en 4K', en: 'High definition, up to 4K' },
    kieModel: 'nano-banana-pro',
    imageField: 'image_input',
    maxImages: 8,
    ratios: [...OUR_RATIOS, 'auto'],
    ratioRequired: false,
    resolution: true,
    extra: { output_format: 'png' },
  },
  'visio-2': {
    engine: 'nanobanana',
    name: { fr: 'Visio 2', en: 'Visio 2' },
    description: { fr: 'Nouvelle génération, jusqu’en 4K', en: 'New generation, up to 4K' },
    kieModel: 'nano-banana-2',
    imageField: 'image_input',
    maxImages: 10,
    ratios: [...OUR_RATIOS, 'auto'],
    ratioRequired: false,
    resolution: true,
    extra: { output_format: 'png' },
  },
  'visio-2-1': {
    engine: 'nanobanana',
    name: { fr: 'Visio 2.1', en: 'Visio 2.1' },
    description: { fr: 'Le plus récent, jusqu’en 4K', en: 'The latest, up to 4K' },
    kieModel: 'nano-banana-2-1',
    imageField: 'image_input',
    maxImages: 10,
    ratios: [...OUR_RATIOS, 'auto'],
    ratioRequired: false,
    resolution: true,
    extra: { output_format: 'png' },
  },
  'visio-2-lite': {
    engine: 'nanobanana',
    name: { fr: 'Visio 2 Lite', en: 'Visio 2 Lite' },
    description: { fr: 'Léger et rapide', en: 'Light and fast' },
    kieModel: 'nano-banana-2-lite',
    imageField: 'image_urls',
    maxImages: 10,
    ratios: [...OUR_RATIOS, 'auto'],
    // Required by the model, but 'auto' is one of its values.
    ratioRequired: false,
    resolution: false,
  },
  'pixel-1-5': {
    engine: 'gpt_image',
    name: { fr: 'Pixel IA 1.5', en: 'Pixel AI 1.5' },
    description: { fr: 'Suivi précis des instructions', en: 'Follows precise instructions' },
    kieModel: 'gpt-image/1.5-image-to-image',
    imageField: 'input_urls',
    maxImages: 16,
    ratios: ['1:1', '3:2', '2:3'],
    ratioRequired: true,
    resolution: false,
    extra: { quality: 'high' },
  },
  'pixel-2': {
    engine: 'gpt_image',
    name: { fr: 'Pixel IA 2', en: 'Pixel AI 2' },
    description: { fr: 'Plus de détail, jusqu’en 4K', en: 'More detail, up to 4K' },
    kieModel: 'gpt-image-2-image-to-image',
    imageField: 'input_urls',
    maxImages: 16,
    ratios: [...OUR_RATIOS, 'auto'],
    ratioRequired: false,
    resolution: true,
    ratioLimits: { '2K': ['5:4', '4:5'] },
  },
  'pixel-2-5': {
    engine: 'gpt_image',
    name: { fr: 'Pixel IA 2.5', en: 'Pixel AI 2.5' },
    description: { fr: 'Le plus récent, jusqu’en 4K', en: 'The latest, up to 4K' },
    // Sunburst, the stronger of GPT Image 2.5's two variants (first on the
    // Arena boards at launch); Flare is `gpt-image-2-5-flare-image-to-image`.
    kieModel: 'gpt-image-2-5-sunburst-image-to-image',
    imageField: 'input_urls',
    maxImages: 16,
    ratios: ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9', 'auto'],
    ratioRequired: false,
    resolution: true,
  },
};

/**
 * The one version each engine runs on (owner, 2026-10-17: « garde la dernière
 * version la plus performante de chaque modèle », no choice offered). Checked
 * that day: Nano Banana Pro still gives the most realistic colours and
 * proportions in hands-on tests (2.1 leads Google's own benchmarks and is
 * cheaper); GPT Image 2.5 Sunburst leads LMArena's image editing and changes
 * only what is asked. The other versions stay in the catalogue for the
 * renders already made.
 */
export const DEFAULT_ENGINE_VERSION: Record<EngineName, EngineVersionKey> = {
  nanobanana: 'visio-pro',
  gpt_image: 'pixel-2-5',
};

/** One engine's versions, newest last, as the menu lists them. */
export function versionsOf(engine: EngineName): EngineVersionKey[] {
  return ENGINE_VERSION_KEYS.filter((k) => ENGINE_VERSIONS[k].engine === engine);
}

export function isEngineVersionKey(value: unknown): value is EngineVersionKey {
  return typeof value === 'string' && (ENGINE_VERSION_KEYS as readonly string[]).includes(value);
}

/**
 * The account's chosen versions (User.engineVersions, JSON) over the
 * defaults: anything unknown, or a version of another engine, is ignored.
 */
export function parseEngineVersions(raw: unknown): Record<EngineName, EngineVersionKey> {
  const next = { ...DEFAULT_ENGINE_VERSION };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const engine of Object.keys(next) as EngineName[]) {
      const v = (raw as Record<string, unknown>)[engine];
      if (isEngineVersionKey(v) && ENGINE_VERSIONS[v].engine === engine) next[engine] = v;
    }
  }
  return next;
}

/**
 * What to call the engine that made an image: the engine alone (« Visio »,
 * « Pixel IA ») since versions are no longer shown (2026-10-17). An unknown
 * engine reads as Visio, as the canvas badge always did.
 */
export function engineDisplayName(
  engine: string | null | undefined,
  _version: string | null | undefined,
  locale: 'fr' | 'en',
): string {
  const label = ENGINE_LABELS[(engine as EngineName) || 'nanobanana'] ?? ENGINE_LABELS.nanobanana;
  return label.name[locale];
}

function ratioValue(r: string): number {
  const [w, h] = r.split(':').map(Number) as [number, number];
  return w / h;
}

/**
 * The ratio to send a version. `asked` is the command bar's ratio (undefined
 * = auto), `sourceAspect` the source image's width / height. A ratio the model
 * does not take (or not at that size) goes to the nearest one it does — the
 * image is cropped to the exact ratio afterwards (output-shape.ts). Returns
 * undefined to send none.
 */
export function kieRatioFor(
  version: EngineVersion,
  asked: string | undefined,
  sourceAspect: number | null,
  size: '1K' | '2K' | '4K' | undefined,
): string | undefined {
  const refused = (size && version.ratioLimits?.[size]) || [];
  const usable = version.ratios.filter((r) => r !== 'auto' && !refused.includes(r));
  const nearest = (target: number) =>
    usable.reduce((best, r) =>
      Math.abs(Math.log(ratioValue(r) / target)) < Math.abs(Math.log(ratioValue(best) / target))
        ? r
        : best,
    );

  if (!asked || asked === 'auto') {
    if (!version.ratioRequired) return version.ratios.includes('auto') ? 'auto' : undefined;
    return nearest(sourceAspect && sourceAspect > 0 ? sourceAspect : 1);
  }
  if (usable.includes(asked)) return asked;
  return nearest(ratioValue(asked));
}
