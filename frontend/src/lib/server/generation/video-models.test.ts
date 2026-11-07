// The catalogue is the only thing standing between a user and a control that
// sends nothing. These tests pin the three places where the owner's brief and
// Kie's real schema disagree, so a future edit cannot quietly re-add a
// capability the endpoint does not have.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VIDEO_MODEL,
  VIDEO_MODELS,
  VIDEO_MODEL_KEYS,
  isVideoRequestShapeValid,
  supportsMode,
  videoResolutionsFor,
} from './video-models';
import { VIDEO_PRICES, videoPrice, videoPriceGap } from '@/lib/provider-cost';
import {
  ANIMATION_INTENSITY,
  CAMERA_MOVE_KEYS,
  ENVIRONMENT_KEYS,
  PRESERVATION_NEGATIVE,
  PRESERVATION_PROMPT,
  buildVideoPrompt,
} from './video-prompt';

describe('the video catalogue', () => {
  it('has the six engines the owner chose, each with a real Kie identifier', () => {
    expect(VIDEO_MODEL_KEYS).toHaveLength(6);
    for (const key of VIDEO_MODEL_KEYS) {
      const m = VIDEO_MODELS[key];
      expect(m.key).toBe(key);
      // A guessed identifier is a 404 the user pays for in waiting.
      expect(m.endpoint.length).toBeGreaterThan(0);
      expect(m.docs).toMatch(/^https:\/\/docs\.kie\.ai\//);
      expect(m.capabilities.modes.length).toBeGreaterThan(0);
      expect(m.capabilities.durations.length).toBeGreaterThan(0);
      expect(m.capabilities.resolutions.length).toBeGreaterThan(0);
    }
    expect(VIDEO_MODELS[DEFAULT_VIDEO_MODEL]).toBeDefined();
  });

  it('never offers text-to-video', () => {
    // Owner, 2026-11-07: « Je ne compte pas faire du texte vers vidéo, non. »
    // Every mode must be seeded by a picture the account owns.
    for (const key of VIDEO_MODEL_KEYS) {
      for (const mode of VIDEO_MODELS[key].capabilities.modes) {
        expect(['first', 'first_last', 'reference']).toContain(mode);
      }
    }
  });

  it('gives Gemini Omni no start frame, because its endpoint has none', () => {
    // The brief lists « First Frame : selon mode ». The real schema has
    // `image_urls` (references) and nothing else; firstFrameUrl is an OUTPUT.
    expect(supportsMode('gemini-omni', 'first')).toBe(false);
    expect(supportsMode('gemini-omni', 'first_last')).toBe(false);
    expect(supportsMode('gemini-omni', 'reference')).toBe(true);
  });

  it('gives Hailuo 2.3 one image and no end frame', () => {
    // Kie's endpoint takes `image_url`, singular. Other resellers of the same
    // model expose start+end; Kie is who we call.
    expect(VIDEO_MODELS['hailuo-2-3'].capabilities.modes).toEqual(['first']);
    expect(VIDEO_MODELS['hailuo-2-3'].capabilities.maxReferenceImages).toBe(0);
  });

  it('refuses 10 seconds at 1080P on Hailuo, and only there', () => {
    expect(videoResolutionsFor('hailuo-2-3', 6)).toContain('1080P');
    expect(videoResolutionsFor('hailuo-2-3', 10)).not.toContain('1080P');
    // The constraint belongs to that one engine; nothing else loses a size.
    expect(videoResolutionsFor('veo-3-1', 8)).toEqual(
      VIDEO_MODELS['veo-3-1'].capabilities.resolutions,
    );
  });

  it('gives a negative prompt only to the engine that takes one', () => {
    // Wan 2.7 is the only one of the six with a real negative field, which is
    // why the preservation negatives are folded into the prompt elsewhere.
    const withNegative = VIDEO_MODEL_KEYS.filter(
      (k) => VIDEO_MODELS[k].capabilities.negativePrompt,
    );
    expect(withNegative).toEqual(['wan-2-7']);
  });

  it('validates a request shape against the engine, not against hope', () => {
    expect(
      isVideoRequestShapeValid({
        model: 'hailuo-2-3',
        mode: 'first',
        duration: 10,
        resolution: '1080P',
      }),
    ).toBe(false);
    expect(
      isVideoRequestShapeValid({
        model: 'hailuo-2-3',
        mode: 'first',
        duration: 6,
        resolution: '1080P',
      }),
    ).toBe(true);
    // A mode the engine does not implement is refused however valid the rest.
    expect(
      isVideoRequestShapeValid({
        model: 'gemini-omni',
        mode: 'first',
        duration: 8,
        resolution: '720p',
      }),
    ).toBe(false);
  });
});

describe('the video price grid', () => {
  it('prices every engine for at least one shape we can actually sell', () => {
    for (const key of VIDEO_MODEL_KEYS) {
      expect(VIDEO_PRICES[key]).toBeDefined();
      const caps = VIDEO_MODELS[key].capabilities;
      const sellable = caps.durations.flatMap((d) =>
        videoResolutionsFor(key, d).map((r) => videoPrice(key, d, r)),
      );
      expect(sellable.some((p) => p !== null && p > 0)).toBe(true);
    }
  });

  it('refuses a combination it has no verified price for', () => {
    // The same discipline as an unverified image version: null, then 409
    // PRICE_NOT_VERIFIED — never a guessed number the owner pays for.
    expect(videoPrice('veo-3-1', 8, '4k')).toBeNull();
    expect(videoPrice('seedance-2-5', 5, '1080p')).toBeNull();
    expect(videoPrice('kling-3-0', 5, '4K')).toBeNull();
    expect(videoPrice('inconnu', 5, '720p')).toBeNull();
  });

  it('bills per second where Kie bills per second, rounded up', () => {
    // Kling is 15.1 credits a second: 5 s is 75.5, and a fraction we fail to
    // charge is a fraction we pay.
    expect(videoPrice('kling-3-0', 5, 'std')).toBe(76);
    expect(videoPrice('seedance-2-5', 5, '720p')).toBe(85);
    expect(videoPrice('wan-2-7', 5, '720p')).toBe(80);
  });

  it('bills per video where Kie bills per video', () => {
    expect(videoPrice('veo-3-1', 8, '1080p')).toBe(65);
    expect(videoPrice('veo-3-1', 4, '1080p')).toBe(65);
    expect(videoPrice('hailuo-2-3', 6, '768P')).toBe(30);
    expect(videoPrice('hailuo-2-3', 10, '768P')).toBe(50);
    expect(videoPrice('gemini-omni', 8, '720p')).toBe(63);
  });

  it('reports the gap between the estimate and what Kie really charged', () => {
    expect(videoPriceGap(85, 70)).toBe(15); // over-estimated, owed back
    expect(videoPriceGap(85, 100)).toBe(-15); // cost more than we sold it for
    expect(videoPriceGap(85, null)).toBe(0); // Kie said nothing: change nothing
  });
});

describe('the architectural preservation engine', () => {
  const base = {
    model: 'veo-3-1',
    camera: 'orbit_left',
    environment: ['trees', 'clouds'],
    intensity: 'natural',
  } as const;

  it('opens on the preservation block, every time', () => {
    for (const key of VIDEO_MODEL_KEYS) {
      const built = buildVideoPrompt({ ...base, model: key });
      expect(built.prompt.startsWith(PRESERVATION_PROMPT)).toBe(true);
    }
  });

  it('never loses the negatives, whichever engine is chosen', () => {
    // Wan takes them in its own field; the other five get them in the prompt.
    const wan = buildVideoPrompt({ ...base, model: 'wan-2-7' });
    expect(wan.negativePrompt).toBe(PRESERVATION_NEGATIVE);
    expect(wan.prompt).not.toContain('Avoid:');

    for (const key of VIDEO_MODEL_KEYS.filter((k) => k !== 'wan-2-7')) {
      const built = buildVideoPrompt({ ...base, model: key });
      expect(built.negativePrompt).toBeNull();
      expect(built.prompt).toContain(PRESERVATION_NEGATIVE);
    }
  });

  it('puts the user request last, after the lock', () => {
    const built = buildVideoPrompt({ ...base, request: 'fin de journée' });
    expect(built.prompt).toContain('User request: fin de journée');
    expect(built.prompt.indexOf('User request')).toBeGreaterThan(
      built.prompt.indexOf(PRESERVATION_PROMPT),
    );
  });

  it('says plainly when nothing in the scene may move', () => {
    const still = buildVideoPrompt({ ...base, environment: [] });
    expect(still.prompt).toContain('Do not animate any environmental element');
  });

  it('keeps the twelve movements and the eleven elements of the brief', () => {
    expect(CAMERA_MOVE_KEYS).toHaveLength(12);
    expect(ENVIRONMENT_KEYS).toHaveLength(11);
    expect(Object.keys(ANIMATION_INTENSITY)).toEqual(['subtle', 'natural', 'dynamic']);
  });

  it('keeps the owner s dictated text untouched', () => {
    // These two strings are the owner's own, integrated verbatim. A reworded
    // preservation block is a different product.
    expect(PRESERVATION_PROMPT).toContain('Preserve the original building exactly as shown.');
    expect(PRESERVATION_PROMPT).toContain('not a newly designed building.');
    expect(PRESERVATION_NEGATIVE).toContain('morphing building');
  });
});
