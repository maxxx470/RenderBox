// One adapter per video engine (2026-11-07, owner's brief, section 7:
// « Créer un adaptateur distinct pour chaque modèle. … Ne pas inventer un
// schéma JSON commun aux cinq modèles. »).
//
// These are PURE functions: a normalised request in, the exact `createTask`
// body out. No network, no key, no clock — so every engine's body is tested
// without spending a credit, which matters more than usual here because the
// owner chose to ship without a paid trial run.
//
// What each adapter is really protecting:
//   - Veo numbers its tiers in `input.model`, not in the top-level `model`;
//   - Kling has no first/last FIELDS, it has the two slots of `image_urls`;
//   - Wan rewrites the prompt by itself unless told not to (see below);
//   - Seedance refuses a start frame sent beside references;
//   - Hailuo takes one image, singular;
//   - Gemini Omni takes references and nothing else.
// Each of those is a silent failure if the body is built by hand at a call
// site, which is why no caller builds one.
import 'server-only';
import {
  VIDEO_MODELS,
  isVideoRequestShapeValid,
  type VideoMode,
  type VideoModelKey,
} from './video-models';

/** What every engine is asked, in RenderPro's own vocabulary. The URLs are
 *  already in Kie's file store — adapters never upload. */
export interface VideoRequest {
  model: VideoModelKey;
  mode: VideoMode;
  /** The render being animated. Required by every mode but `reference`. */
  firstFrameUrl?: string | undefined;
  /** Where the clip must end. Only in `first_last`. */
  lastFrameUrl?: string | undefined;
  /** Pictures guiding the look. Only in `reference`. */
  referenceUrls?: readonly string[] | undefined;
  /** Built by buildVideoPrompt — preservation block first, request last. */
  prompt: string;
  /** Only Wan 2.7 has a field for it; null everywhere else. */
  negativePrompt: string | null;
  duration: number;
  resolution: string;
  /** Omitted on purpose when a source image is pinned: letting the output
   *  follow the source's own framing preserves the composition, which is the
   *  whole point of this module. */
  ratio?: string | undefined;
  audio: boolean;
  seed?: number | undefined;
}

/** The body posted to POST https://api.kie.ai/api/v1/jobs/createTask. */
export interface KieVideoTask {
  model: string;
  input: Record<string, unknown>;
}

/** The request cannot be sent as asked. Thrown before any network call, so
 *  nothing is debited and nothing is created on Kie's side. */
export class VideoRequestError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'UNSUPPORTED_MODE'
      | 'INVALID_SHAPE'
      | 'MISSING_SOURCE'
      | 'TOO_MANY_REFERENCES'
      | 'MODE_CONFLICT',
  ) {
    super(message);
    this.name = 'VideoRequestError';
  }
}

/** The checks every engine shares, run once before the engine's own. */
function assertCommon(req: VideoRequest): void {
  const caps = VIDEO_MODELS[req.model].capabilities;
  if (!caps.modes.includes(req.mode)) {
    throw new VideoRequestError(`${req.model} does not implement ${req.mode}`, 'UNSUPPORTED_MODE');
  }
  if (
    !isVideoRequestShapeValid({
      model: req.model,
      mode: req.mode,
      duration: req.duration,
      resolution: req.resolution,
    })
  ) {
    throw new VideoRequestError(
      `${req.model}: ${req.duration}s at ${req.resolution} is not offered`,
      'INVALID_SHAPE',
    );
  }
  if (req.mode !== 'reference' && !req.firstFrameUrl) {
    throw new VideoRequestError('a source image is required', 'MISSING_SOURCE');
  }
  if (req.mode === 'first_last' && !req.lastFrameUrl) {
    throw new VideoRequestError('an end image is required', 'MISSING_SOURCE');
  }
  if (req.mode === 'reference') {
    const refs = req.referenceUrls ?? [];
    if (refs.length === 0) {
      throw new VideoRequestError('at least one reference is required', 'MISSING_SOURCE');
    }
    if (refs.length > caps.maxReferenceImages) {
      throw new VideoRequestError(
        `${req.model} takes at most ${caps.maxReferenceImages} references`,
        'TOO_MANY_REFERENCES',
      );
    }
  }
}

/**
 * Google Veo 3.1. The tier lives in `input.model`; `veo3_fast` is the one
 * RenderPro sells (Lite is weaker, Quality is 255 credits a clip).
 * ⚠ REFERENCE_2_VIDEO exists only at 8 s and only on fast/lite, so the mode
 * pins the duration rather than letting Kie refuse it after the debit.
 */
function veo(req: VideoRequest): KieVideoTask {
  const images =
    req.mode === 'reference'
      ? [...(req.referenceUrls ?? [])]
      : [req.firstFrameUrl!, ...(req.lastFrameUrl ? [req.lastFrameUrl] : [])];
  return {
    model: 'veo-3-1',
    input: {
      prompt: req.prompt,
      model: 'veo3_fast',
      generation_type:
        req.mode === 'reference' ? 'REFERENCE_2_VIDEO' : 'FIRST_AND_LAST_FRAMES_2_VIDEO',
      image_urls: images,
      resolution: req.resolution,
      duration: req.mode === 'reference' ? 8 : req.duration,
      // Auto centre-crops on the source's own orientation, which keeps the
      // render's framing when the user asked for no particular ratio.
      aspect_ratio: req.ratio ?? 'Auto',
    },
  };
}

/**
 * ByteDance Seedance 2.5.
 * ⚠ The scenarios are mutually exclusive: a first frame may not travel with
 * any reference array. Enforced here rather than hoped for.
 */
function seedance(req: VideoRequest): KieVideoTask {
  const refs = req.referenceUrls ?? [];
  if (req.mode !== 'reference' && refs.length > 0) {
    throw new VideoRequestError(
      'Seedance refuses references beside a start frame',
      'MODE_CONFLICT',
    );
  }
  const input: Record<string, unknown> = {
    prompt: req.prompt,
    generate_audio: req.audio,
    resolution: req.resolution,
    duration: req.duration,
    output_format: 'mp4',
    aspect_ratio: req.ratio ?? 'adaptive',
  };
  if (req.mode === 'reference') {
    input.reference_image_urls = [...refs];
  } else {
    input.first_frame_url = req.firstFrameUrl;
    if (req.lastFrameUrl) input.last_frame_url = req.lastFrameUrl;
  }
  return { model: 'bytedance/seedance-2-5', input };
}

/**
 * Kling 3.0. Its frames are the two slots of `image_urls`: one picture is the
 * first frame, two are the first and the last. `mode` is what the others call
 * a resolution. Multi-shot is real and deliberately not offered yet.
 * The ratio is omitted when a picture is pinned — Kling then follows the
 * first frame, which is what preserves the composition.
 */
function kling(req: VideoRequest): KieVideoTask {
  return {
    model: 'kling-3.0/video',
    input: {
      prompt: req.prompt,
      image_urls: [req.firstFrameUrl!, ...(req.lastFrameUrl ? [req.lastFrameUrl] : [])],
      sound: req.audio,
      duration: String(req.duration),
      mode: req.resolution,
      multi_shots: false,
      ...(req.ratio ? { aspect_ratio: req.ratio } : {}),
    },
  };
}

/**
 * Alibaba Wan 2.7 — the only engine with a real negative prompt and a seed.
 * ⚠ `prompt_extend` defaults to TRUE, which lets Wan rewrite the prompt
 * before generating. On any other product that is a convenience; here it
 * would rewrite the preservation block the whole module exists to send, so it
 * is forced to false.
 */
function wan(req: VideoRequest): KieVideoTask {
  return {
    model: 'wan/2-7-image-to-video',
    input: {
      prompt: req.prompt,
      ...(req.negativePrompt ? { negative_prompt: req.negativePrompt.slice(0, 500) } : {}),
      first_frame_url: req.firstFrameUrl,
      ...(req.lastFrameUrl ? { last_frame_url: req.lastFrameUrl } : {}),
      resolution: req.resolution,
      duration: req.duration,
      prompt_extend: false,
      watermark: false,
      ...(req.seed === undefined ? {} : { seed: req.seed }),
    },
  };
}

/** MiniMax Hailuo 2.3 — one image, a duration and a size, nothing else. */
function hailuo(req: VideoRequest): KieVideoTask {
  return {
    model: 'hailuo/2-3-image-to-video-standard',
    input: {
      prompt: req.prompt.slice(0, 5000),
      image_url: req.firstFrameUrl,
      duration: String(req.duration),
      resolution: req.resolution,
    },
  };
}

/**
 * Google Gemini Omni — references only. Its quota is its own:
 * images + videos × 2 + characters ≤ 7. RenderPro sends no video and no
 * character, so the seven slots are all for pictures.
 */
function geminiOmni(req: VideoRequest): KieVideoTask {
  return {
    model: 'gemini-omni-video',
    input: {
      prompt: req.prompt,
      duration: String(req.duration),
      image_urls: [...(req.referenceUrls ?? [])],
      resolution: req.resolution,
      ...(req.ratio ? { aspect_ratio: req.ratio } : {}),
      ...(req.seed === undefined ? {} : { seed: req.seed }),
    },
  };
}

const ADAPTERS: Record<VideoModelKey, (req: VideoRequest) => KieVideoTask> = {
  'veo-3-1': veo,
  'seedance-2-5': seedance,
  'kling-3-0': kling,
  'wan-2-7': wan,
  'hailuo-2-3': hailuo,
  'gemini-omni': geminiOmni,
};

/**
 * The body to post, or a VideoRequestError naming what is wrong — always
 * BEFORE the credits are debited and before Kie is called, so a refusal costs
 * the user nothing and leaves no orphan task.
 */
export function buildVideoTask(req: VideoRequest): KieVideoTask {
  assertCommon(req);
  const task = ADAPTERS[req.model](req);
  if (task.model !== VIDEO_MODELS[req.model].endpoint) {
    // A guard against the one mistake that costs real money quietly: posting
    // a body to the wrong model identifier, which Kie would happily bill.
    throw new VideoRequestError(`adapter built ${task.model} for ${req.model}`, 'INVALID_SHAPE');
  }
  return task;
}
