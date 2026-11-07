// THE catalogue of the video engines (2026-11-07, owner — « Cahier de
// référence — AI VIDEO GENERATION »): what each Kie endpoint really accepts.
//
// The owner's own rule for this module, and the reason it exists at all:
// « ne jamais afficher une fonctionnalité comme disponible si l'endpoint et la
// version du modèle sélectionné ne la prennent pas réellement en charge. »
// So the command bar reads THIS file to decide which chips to draw, and the
// adapters read it to decide what to send. A capability that is not written
// here does not exist in the interface.
//
// Every field below was read on docs.kie.ai on 2026-11-07 and is cited by its
// endpoint page. Where the owner's brief and the documentation disagree, the
// documentation wins and the disagreement is written down — three of them are
// marked ⚠ below, because each one would have shipped a control that sends
// nothing:
//   1. Gemini Omni has NO first/last-frame input. The brief lists « First
//      Frame : selon mode / Last Frame : à vérifier ». The real schema has
//      `image_urls` (references) and nothing else; `firstFrameUrl` and
//      `lastFrameUrl` exist only in the RESULT. Gemini Omni 1.2 Flash, which
//      does promise them, is « Coming Soon » on Kie and has no endpoint, so it
//      is deliberately absent from this catalogue.
//   2. Hailuo 2.3 has no end frame either on Kie: one `image_url`, singular.
//      Other resellers expose a start+end mode for the same model; Kie's
//      endpoint does not, and Kie is who we call.
//   3. Seedance 2.5's three scenarios are MUTUALLY EXCLUSIVE — first/last
//      frames cannot be combined with reference images, videos or audio. The
//      brief presents them as a list of features, which would let a user pin
//      a start frame AND references and get a refusal they cannot understand.
//
// Not `server-only`: the command bar prices and draws the controls before the
// click. The server still validates every request against this same table —
// never against what the client claims the model supports.
import type { ResolutionKey } from './resolutions';

/** The engines offered, in the order the model selector shows them. */
export const VIDEO_MODEL_KEYS = [
  'veo-3-1',
  'seedance-2-5',
  'kling-3-0',
  'wan-2-7',
  'hailuo-2-3',
  'gemini-omni',
] as const;

export type VideoModelKey = (typeof VIDEO_MODEL_KEYS)[number];

/**
 * How a generation is seeded. The three are mutually exclusive on every
 * engine — one request is one mode.
 *  - `first`        a single source image, animated;
 *  - `first_last`   a start image and an end image, the engine builds the way;
 *  - `reference`    several pictures guiding look and consistency.
 * RenderPro never offers text-to-video (owner, 2026-11-07: « Je ne compte pas
 * faire du texte vers vidéo, non. Je compte faire de l'image à une vidéo »),
 * so `TEXT_2_VIDEO` and its kin are not in this union even where the endpoint
 * accepts them.
 */
export type VideoMode = 'first' | 'first_last' | 'reference';

/** What the engine can be asked for, beyond the mode. */
export interface VideoCapabilities {
  /** Modes the endpoint really implements, in the order to show them. */
  modes: readonly VideoMode[];
  /** Durations in seconds the endpoint accepts. A continuous range is listed
   *  as the values we actually offer, never « 2 to 30 » in the interface. */
  durations: readonly number[];
  /** Output sizes, named as the endpoint names them (they are NOT our 1k/2k/4k). */
  resolutions: readonly string[];
  /** Aspect ratios the endpoint takes; empty when it has no such parameter
   *  (Wan 2.7 has none — the output follows the source image). */
  ratios: readonly string[];
  /** Can the caller turn the soundtrack on or off? `always` = audio is produced
   *  and there is no switch (Veo 3.1), `none` = the endpoint makes no sound. */
  audio: 'toggle' | 'always' | 'none';
  /** Reference pictures accepted in `reference` mode; 0 when unsupported. */
  maxReferenceImages: number;
  /** Does the endpoint take a negative prompt of its own? When false, the
   *  preservation negatives have to be folded into the positive prompt. */
  negativePrompt: boolean;
  /** Does it accept a seed, so a test can be repeated? */
  seed: boolean;
}

export interface VideoModel {
  key: VideoModelKey;
  /** What the user reads. Vendor names are deliberate here, unlike the image
   *  engines: the owner's brief names them on the cards (« GOOGLE VEO 3.1 »,
   *  « BYTEDANCE SEEDANCE 2.5 »), and a professional choosing an engine wants
   *  to know which one it is. */
  label: string;
  /** The badge under the name on the selector card. */
  positioning: { fr: string; en: string };
  /** The company behind the engine, shown on the selector card beside its
   *  own mark (owner, 2026-11-07: « il faudra que les moteurs s'affichent
   *  avec leurs logos d'origine »). Unlike the image engines, which are
   *  deliberately never named by vendor, a professional picking a video
   *  engine wants to know whose it is. */
  vendor: string;
  /** The vendor's mark, a square on white in public/video-engines/. The file
   *  is the vendor's own trademark, used to identify their product and
   *  nothing else — never redrawn, never recoloured to the charter. A missing
   *  file leaves the card showing the name alone, which a test allows. */
  logo: string;
  /** The exact string Kie expects in the request's top-level `model`. Never
   *  derive it from `key`: `kling-3.0/video` and `hailuo/2-3-…` have shapes of
   *  their own, and a guessed identifier is a 404 the user pays for in time. */
  endpoint: string;
  capabilities: VideoCapabilities;
  /** The page the figures above were read from, so the next reader can check. */
  docs: string;
}

/**
 * Google Veo 3.1 — the premium engine.
 * Top-level `model` is `veo-3-1`; the tier (`veo3_fast` | `veo3_lite` |
 * `veo3`) goes in `input.model`, which is why the three tiers are three rows
 * of the price grid and not three endpoints.
 * ⚠ `REFERENCE_2_VIDEO` runs only on fast and lite, and only at 8 s.
 * ⚠ There is no audio parameter at all: every Veo video carries sound.
 */
const VEO_3_1: VideoModel = {
  key: 'veo-3-1',
  label: 'Google Veo 3.1',
  vendor: 'Google DeepMind',
  logo: '/video-engines/veo.webp',
  positioning: { fr: 'Photoréalisme premium', en: 'Premium photorealism' },
  endpoint: 'veo-3-1',
  capabilities: {
    modes: ['first', 'first_last', 'reference'],
    durations: [4, 6, 8],
    resolutions: ['720p', '1080p', '4k'],
    ratios: ['16:9', '9:16', 'Auto'],
    audio: 'always',
    maxReferenceImages: 3,
    negativePrompt: false,
    seed: false,
  },
  docs: 'https://docs.kie.ai/veo3-api/generate-veo-3-video',
};

/**
 * ByteDance Seedance 2.5 — the multimodal engine.
 * ⚠ The three scenarios are mutually exclusive: `first_frame_url` cannot be
 * sent with any `reference_*` array, and `last_frame_url` requires a first.
 * The durations below are the ones RenderPro offers, not the endpoint's whole
 * 4–30 s range: a 30 s clip at 17 credits a second is 510 credits, more than a
 * Découverte plan holds, and nothing in the interface should make that one
 * click away.
 */
const SEEDANCE_2_5: VideoModel = {
  key: 'seedance-2-5',
  label: 'Seedance 2.5',
  vendor: 'ByteDance',
  logo: '/video-engines/seedance.webp',
  positioning: { fr: 'Multimodal avancé', en: 'Advanced multimodal' },
  endpoint: 'bytedance/seedance-2-5',
  capabilities: {
    modes: ['first', 'first_last', 'reference'],
    durations: [4, 5, 6, 8, 10],
    resolutions: ['480p', '720p', '1080p'],
    ratios: ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    audio: 'toggle',
    maxReferenceImages: 30,
    negativePrompt: false,
    seed: false,
  },
  docs: 'https://docs.kie.ai/market/bytedance/seedance-2-5',
};

/**
 * Kling 3.0 — the cinematic engine.
 * Its first/last frames are not two fields but the two slots of `image_urls`:
 * one picture is the first frame, two are the first and the last. Its `mode`
 * (std | pro | 4K) is what other engines call a resolution, which is why the
 * resolutions below are its own vocabulary.
 * Multi-shot (up to 5 shots, each with its own prompt and duration) is real
 * and documented, and is deliberately NOT exposed in the first version: it
 * needs an interface of its own, and the fiche's priority is fidelity.
 * ⚠ Kie's market landing page now features Kling 4.0; `kling-3.0/video` is
 * still documented and priced, which is what matters.
 */
const KLING_3_0: VideoModel = {
  key: 'kling-3-0',
  label: 'Kling 3.0',
  vendor: 'Kuaishou',
  logo: '/video-engines/kling.webp',
  positioning: { fr: 'Mouvement cinématique', en: 'Cinematic motion' },
  endpoint: 'kling-3.0/video',
  capabilities: {
    modes: ['first', 'first_last'],
    durations: [3, 5, 8, 10],
    resolutions: ['std', 'pro', '4K'],
    ratios: ['16:9', '9:16', '1:1'],
    audio: 'toggle',
    maxReferenceImages: 0,
    negativePrompt: false,
    seed: false,
  },
  docs: 'https://docs.kie.ai/market/kling/kling-3-0',
};

/**
 * Alibaba Wan 2.7 — the controllable engine.
 * The only one of the six with a real negative prompt and a seed, which makes
 * it the engine the fidelity benchmark should lean on: the preservation
 * negatives go where they belong instead of being folded into the positive
 * prompt, and a seed lets the same test be run twice.
 * ⚠ It has NO aspect-ratio parameter: the output follows the source image.
 */
const WAN_2_7: VideoModel = {
  key: 'wan-2-7',
  label: 'Wan 2.7',
  vendor: 'Alibaba',
  logo: '/video-engines/wan.webp',
  positioning: { fr: 'Références et contrôle', en: 'Reference & control' },
  endpoint: 'wan/2-7-image-to-video',
  capabilities: {
    modes: ['first', 'first_last'],
    durations: [3, 5, 8, 10],
    resolutions: ['720p', '1080p'],
    ratios: [],
    audio: 'none',
    maxReferenceImages: 0,
    negativePrompt: true,
    seed: true,
  },
  docs: 'https://docs.kie.ai/market/wan/2-7-image-to-video',
};

/**
 * MiniMax Hailuo 2.3 — the fixed-price engine (owner, 2026-11-07: « ajoute
 * Hailuo 2.3 (MiniMax) »). Billed per video, not per second, so it is the one
 * whose cost a user can predict without arithmetic.
 * ⚠ One image only: `image_url`, singular. No end frame on Kie, whatever other
 * resellers of the same model offer.
 * ⚠ 10 s does not exist at 1080P — `videoResolutionsFor` enforces it, rather
 * than leaving the pair to be discovered through a paid refusal.
 * The Pro tier is the same endpoint with `-pro`; it is a price row, not a
 * second card.
 */
const HAILUO_2_3: VideoModel = {
  key: 'hailuo-2-3',
  label: 'Hailuo 2.3',
  vendor: 'MiniMax',
  logo: '/video-engines/hailuo.webp',
  positioning: { fr: 'Prix fixe par vidéo', en: 'Flat price per video' },
  endpoint: 'hailuo/2-3-image-to-video-standard',
  capabilities: {
    modes: ['first'],
    durations: [6, 10],
    resolutions: ['768P', '1080P'],
    ratios: [],
    audio: 'none',
    maxReferenceImages: 0,
    negativePrompt: false,
    seed: false,
  },
  docs: 'https://docs.kie.ai/market/hailuo/2-3-image-to-video-standard',
};

/**
 * Google Gemini Omni — the reference engine.
 * ⚠ NO first/last frame. Its single picture input is `image_urls`, a bag of up
 * to 7 references, so in RenderPro it offers `reference` ALONE. Showing it a
 * start-frame slot would send the picture as one reference among others and
 * animate something that merely resembles the render.
 * Its quota is its own: images + videos × 2 + characters ≤ 7.
 * Gemini Omni 1.2 Flash (15 s, first/last frame, 4K, conversational editing)
 * is announced on Kie and has no endpoint. It is not in this file, and must
 * not be added from its marketing page — only from its published schema.
 */
const GEMINI_OMNI: VideoModel = {
  key: 'gemini-omni',
  label: 'Gemini Omni',
  vendor: 'Google',
  logo: '/video-engines/gemini.webp',
  positioning: { fr: 'Multimodal par références', en: 'Reference multimodal' },
  endpoint: 'gemini-omni-video',
  capabilities: {
    modes: ['reference'],
    durations: [4, 6, 8, 10],
    resolutions: ['720p', '1080p', '4k'],
    ratios: ['16:9', '9:16'],
    audio: 'none',
    maxReferenceImages: 7,
    negativePrompt: false,
    seed: true,
  },
  docs: 'https://docs.kie.ai/market/gemini-omni-video',
};

export const VIDEO_MODELS: Record<VideoModelKey, VideoModel> = {
  'veo-3-1': VEO_3_1,
  'seedance-2-5': SEEDANCE_2_5,
  'kling-3-0': KLING_3_0,
  'wan-2-7': WAN_2_7,
  'hailuo-2-3': HAILUO_2_3,
  'gemini-omni': GEMINI_OMNI,
};

/** The engine a new user lands on: the best fidelity per credit of the six. */
export const DEFAULT_VIDEO_MODEL: VideoModelKey = 'veo-3-1';

/** Does this engine really implement that mode? The command bar asks before
 *  drawing the « Image de fin » slot, and the route asks before sending. */
export function supportsMode(key: VideoModelKey, mode: VideoMode): boolean {
  return VIDEO_MODELS[key].capabilities.modes.includes(mode);
}

/**
 * The sizes offered for a given duration. Only Hailuo constrains the pair
 * today (no 10 s at 1080P), but the signature takes the duration for all of
 * them so a future constraint has somewhere to live instead of being special-
 * cased at the call site.
 */
export function videoResolutionsFor(key: VideoModelKey, duration: number): readonly string[] {
  const all = VIDEO_MODELS[key].capabilities.resolutions;
  if (key === 'hailuo-2-3' && duration >= 10) return all.filter((r) => r !== '1080P');
  return all;
}

/** Is this duration × size pair sendable? The server's last word before Kie. */
export function isVideoRequestShapeValid(input: {
  model: VideoModelKey;
  mode: VideoMode;
  duration: number;
  resolution: string;
}): boolean {
  const caps = VIDEO_MODELS[input.model].capabilities;
  if (!caps.modes.includes(input.mode)) return false;
  if (!caps.durations.includes(input.duration)) return false;
  return videoResolutionsFor(input.model, input.duration).includes(input.resolution);
}

/**
 * The image sizes this project already speaks (1k / 2k / 4k) are NOT the video
 * ones, and nothing should quietly map between them — a « 4k » chip that sends
 * Kling's `4K` mode and Hailuo's `1080P` would be one control telling two
 * stories. This type is exported so a caller is forced to say which vocabulary
 * it is in.
 */
export type VideoResolution = string & { readonly __notAnImageResolution?: ResolutionKey };
