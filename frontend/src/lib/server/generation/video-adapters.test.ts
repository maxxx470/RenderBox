// Six engines, six request schemas, and no paid trial run to catch a mistake
// (owner, 2026-11-07: « On n'a pas besoin de faire un test »). So these tests
// are the only thing between a wrong field name and a credit spent on a 400.
import { describe, it, expect } from 'vitest';
import { buildVideoTask, VideoRequestError, type VideoRequest } from './video-adapters';
import { VIDEO_MODELS, VIDEO_MODEL_KEYS } from './video-models';

const SRC = 'https://file.kie.ai/first.jpg';
const END = 'https://file.kie.ai/last.jpg';

function req(over: Partial<VideoRequest> & Pick<VideoRequest, 'model'>): VideoRequest {
  return {
    mode: 'first',
    firstFrameUrl: SRC,
    prompt: 'Preserve the original building exactly as shown.',
    negativePrompt: null,
    duration: 6,
    resolution: '768P',
    audio: false,
    ...over,
  };
}

describe('every adapter', () => {
  it('posts to the identifier its own catalogue entry declares', () => {
    const shapes: Record<string, Partial<VideoRequest>> = {
      'veo-3-1': { duration: 8, resolution: '1080p' },
      'seedance-2-5': { duration: 5, resolution: '720p' },
      'kling-3-0': { duration: 5, resolution: 'std' },
      'wan-2-7': { duration: 5, resolution: '720p' },
      'hailuo-2-3': { duration: 6, resolution: '768P' },
      'gemini-omni': {
        mode: 'reference',
        referenceUrls: [SRC],
        duration: 8,
        resolution: '720p',
      },
    };
    for (const key of VIDEO_MODEL_KEYS) {
      const task = buildVideoTask(req({ model: key, ...shapes[key] }));
      expect(task.model).toBe(VIDEO_MODELS[key].endpoint);
      expect(task.input.prompt).toBeTruthy();
    }
  });

  it('refuses a mode the engine does not implement, before any call', () => {
    expect(() =>
      buildVideoTask(req({ model: 'gemini-omni', mode: 'first', resolution: '720p', duration: 8 })),
    ).toThrow(VideoRequestError);
    expect(() =>
      buildVideoTask(req({ model: 'hailuo-2-3', mode: 'first_last', lastFrameUrl: END })),
    ).toThrow(VideoRequestError);
  });

  it('refuses a duration and size the engine does not sell', () => {
    // Hailuo has no 10 s at 1080P. Catching it here costs nothing; catching
    // it at Kie costs the wait and, worse, looks like our bug.
    expect(() =>
      buildVideoTask(req({ model: 'hailuo-2-3', duration: 10, resolution: '1080P' })),
    ).toThrow(/not offered/);
  });

  it('refuses an end frame mode with no end frame', () => {
    expect(() =>
      buildVideoTask(
        req({ model: 'veo-3-1', mode: 'first_last', duration: 8, resolution: '1080p' }),
      ),
    ).toThrow(/end image/);
  });
});

describe('Veo 3.1', () => {
  const base = { model: 'veo-3-1', duration: 8, resolution: '1080p' } as const;

  it('puts the tier in input.model, not in the top-level model', () => {
    const task = buildVideoTask(req(base));
    expect(task.model).toBe('veo-3-1');
    expect(task.input.model).toBe('veo3_fast');
  });

  it('sends one image for a start frame and two for a start and an end', () => {
    expect(buildVideoTask(req(base)).input.image_urls).toEqual([SRC]);
    expect(
      buildVideoTask(req({ ...base, mode: 'first_last', lastFrameUrl: END })).input.image_urls,
    ).toEqual([SRC, END]);
  });

  it('pins a reference generation to 8 seconds, which is all Veo allows there', () => {
    const task = buildVideoTask(
      req({ ...base, mode: 'reference', referenceUrls: [SRC], duration: 4, resolution: '1080p' }),
    );
    expect(task.input.generation_type).toBe('REFERENCE_2_VIDEO');
    expect(task.input.duration).toBe(8);
  });
});

describe('Seedance 2.5', () => {
  const base = { model: 'seedance-2-5', duration: 5, resolution: '720p' } as const;

  it('refuses references sent beside a start frame', () => {
    // The three scenarios are mutually exclusive in Kie's own schema.
    expect(() => buildVideoTask(req({ ...base, referenceUrls: [END] }))).toThrow(/beside/);
  });

  it('sends the frames or the references, never both', () => {
    const framed = buildVideoTask(req({ ...base, mode: 'first_last', lastFrameUrl: END }));
    expect(framed.input.first_frame_url).toBe(SRC);
    expect(framed.input.last_frame_url).toBe(END);
    expect(framed.input.reference_image_urls).toBeUndefined();

    const referenced = buildVideoTask(
      req({ ...base, mode: 'reference', firstFrameUrl: undefined, referenceUrls: [SRC, END] }),
    );
    expect(referenced.input.reference_image_urls).toEqual([SRC, END]);
    expect(referenced.input.first_frame_url).toBeUndefined();
  });

  it('carries the audio switch, which this engine really has', () => {
    expect(buildVideoTask(req({ ...base, audio: true })).input.generate_audio).toBe(true);
    expect(buildVideoTask(req({ ...base, audio: false })).input.generate_audio).toBe(false);
  });
});

describe('Kling 3.0', () => {
  const base = { model: 'kling-3-0', duration: 5, resolution: 'std' } as const;

  it('uses the two slots of image_urls as its frames', () => {
    const task = buildVideoTask(req({ ...base, mode: 'first_last', lastFrameUrl: END }));
    expect(task.input.image_urls).toEqual([SRC, END]);
    expect(task.input.first_frame_url).toBeUndefined();
  });

  it('sends the size as its own mode, and the duration as a string', () => {
    const task = buildVideoTask(req(base));
    expect(task.input.mode).toBe('std');
    expect(task.input.duration).toBe('5');
    expect(task.input.multi_shots).toBe(false);
  });

  it('omits the ratio when a picture is pinned, so the framing is the source s', () => {
    expect(buildVideoTask(req(base)).input.aspect_ratio).toBeUndefined();
    expect(buildVideoTask(req({ ...base, ratio: '16:9' })).input.aspect_ratio).toBe('16:9');
  });
});

describe('Wan 2.7', () => {
  const base = { model: 'wan-2-7', duration: 5, resolution: '720p' } as const;

  it('never lets Wan rewrite the preservation prompt', () => {
    // prompt_extend defaults to true on Kie's side: left alone, Wan would
    // reword the one block this whole module exists to send.
    expect(buildVideoTask(req(base)).input.prompt_extend).toBe(false);
  });

  it('is the only engine that gets the negatives in their own field', () => {
    const task = buildVideoTask(req({ ...base, negativePrompt: 'morphing building' }));
    expect(task.input.negative_prompt).toBe('morphing building');
  });

  it('cuts the negatives at the 500 characters Kie accepts', () => {
    const task = buildVideoTask(req({ ...base, negativePrompt: 'x'.repeat(900) }));
    expect(String(task.input.negative_prompt)).toHaveLength(500);
  });

  it('sends a seed only when one was asked for', () => {
    expect(buildVideoTask(req(base)).input.seed).toBeUndefined();
    expect(buildVideoTask(req({ ...base, seed: 42 })).input.seed).toBe(42);
  });
});

describe('Hailuo 2.3', () => {
  it('sends one image, singular, and strings for the rest', () => {
    const task = buildVideoTask(req({ model: 'hailuo-2-3', duration: 10, resolution: '768P' }));
    expect(task.input.image_url).toBe(SRC);
    expect(task.input.image_urls).toBeUndefined();
    expect(task.input.duration).toBe('10');
    expect(task.input.resolution).toBe('768P');
  });
});

describe('Gemini Omni', () => {
  const base = {
    model: 'gemini-omni',
    mode: 'reference',
    firstFrameUrl: undefined,
    referenceUrls: [SRC],
    duration: 8,
    resolution: '720p',
  } as const;

  it('sends references and never a frame', () => {
    const task = buildVideoTask(req(base));
    expect(task.input.image_urls).toEqual([SRC]);
    expect(task.input.first_frame_url).toBeUndefined();
    expect(task.input.duration).toBe('8');
  });

  it('refuses more than the seven pictures its quota allows', () => {
    const eight = Array.from({ length: 8 }, (_, i) => `https://file.kie.ai/${i}.jpg`);
    expect(() => buildVideoTask(req({ ...base, referenceUrls: eight }))).toThrow(/at most 7/);
  });

  it('refuses a reference generation with nothing to reference', () => {
    expect(() => buildVideoTask(req({ ...base, referenceUrls: [] }))).toThrow(/at least one/);
  });
});
