// Shared types for the pluggable render-generation engines. Deliberately NOT
// tagged `server-only` — CommandBar.tsx (client component) imports
// ENGINE_NAMES to enumerate the engine-selector dropdown, mirroring how
// generation/presets.ts shares its PRESET_KEYS with the client. Only
// ./nanobanana.ts, ./gpt-image.ts and ./index.ts (which hold real API keys
// and call out to Google/OpenAI) are server-only.
// Type-only both ways with ../ratios (which imports EngineName from here):
// `import type` is erased at compile time, so neither module creates a
// runtime edge and there is no import cycle to resolve.
import type { RatioKey } from '../ratios';
import type { ResolutionKey } from '../resolutions';
import type { EngineVersionKey } from '../engine-versions';

export type EngineName = 'nanobanana' | 'gpt_image';

export const ENGINE_NAMES = ['nanobanana', 'gpt_image'] as const satisfies readonly EngineName[];

export interface ReferenceImage {
  buffer: Buffer;
  mimeType: string;
}

export interface GenerateRenderInput {
  sourceImageBuffer: Buffer;
  sourceMimeType: string;
  // Fully assembled: materials sheet + preset modifier + free text (see
  // generation/build-prompt.ts). Engines never see materials/preset
  // separately — one prompt string in, one image out.
  prompt: string;
  // Phase 5 — additional images to hand the engine alongside the source
  // (e.g. a character/object/moodboard reference for "add element" edits).
  // Both engines accept multiple input images natively (Gemini via multiple
  // inlineData parts, gpt-image-1 via an array in `image`).
  referenceImages?: ReferenceImage[] | undefined;
  // Requested output aspect ratio. Omitted (or 'auto') means the engine keeps
  // whatever framing it would have chosen from the source, which is how every
  // generation behaved before the ratio control existed. Each engine
  // translates this itself — see generation/ratios.ts.
  aspectRatio?: RatioKey | undefined;
  // Requested output size (1K / 2K / 4K). Visio renders at it; any engine
  // output smaller than it is enlarged afterwards — see output-shape.ts.
  resolution?: ResolutionKey | undefined;
  // The engine version (engine-versions.ts), run through Kie (kie.ts). Absent:
  // the engine's direct API (Gemini / OpenAI), as before versions existed.
  version?: EngineVersionKey | undefined;
  // Set by generateRender (index.ts): aborted once ENGINE_DEADLINE_MS is up.
  // Each engine hands it to its SDK, so the connection is closed then.
  signal?: AbortSignal | undefined;
}

/**
 * How long one engine call may take — every SDK retry and Visio's Flash
 * fallback included. Fits the routes' 300 s maxDuration (Vercel Hobby with
 * Fluid compute, checked 2026-10-11) with the upload, the database writes
 * and the 30 s material detection after it.
 */
export const ENGINE_DEADLINE_MS = 180_000;

export interface GenerateRenderOutput {
  imageBuffer: Buffer;
  mimeType: string;
  // The version that made the image — absent when the direct API did
  // (no version asked, or Kie's account refused and the call fell back).
  engineVersion?: EngineVersionKey;
  // What Kie charged for it, in Kie credits (recordInfo creditsConsumed) —
  // absent off Kie. Stored on the RenderNode for the API usage in /admin.
  providerCredits?: number;
}

export class EngineNotConfiguredError extends Error {
  constructor(public readonly engine: EngineName) {
    super(`Generation engine "${engine}" is not configured (missing API key)`);
    this.name = 'EngineNotConfiguredError';
  }
}

/** The engine did not answer within ENGINE_DEADLINE_MS; RenderBox stopped waiting. */
export class EngineTimeoutError extends Error {
  constructor(
    public readonly engine: EngineName,
    public readonly deadlineMs: number,
  ) {
    super(`Generation engine "${engine}" did not answer within ${deadlineMs / 1000} s`);
    this.name = 'EngineTimeoutError';
  }
}
