// Shared types for the pluggable render-generation engines. Deliberately NOT
// tagged `server-only` — CommandBar.tsx (client component) imports
// ENGINE_NAMES to enumerate the engine-selector dropdown, mirroring how
// generation/presets.ts shares its PRESET_KEYS with the client. Only
// ./nanobanana.ts, ./gpt-image.ts and ./index.ts (which hold real API keys
// and call out to Google/OpenAI) are server-only.
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
}

export interface GenerateRenderOutput {
  imageBuffer: Buffer;
  mimeType: string;
}

export class EngineNotConfiguredError extends Error {
  constructor(public readonly engine: EngineName) {
    super(`Generation engine "${engine}" is not configured (missing API key)`);
    this.name = 'EngineNotConfiguredError';
  }
}
