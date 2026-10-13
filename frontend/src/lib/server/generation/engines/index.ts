// Single entry point for render generation — the ONLY place that dispatches
// on engine name. Route handlers must always call generateRender()/
// isEngineConfigured(); no `if (engine === ...)` branching anywhere else.
import 'server-only';
import type { EngineName, GenerateRenderInput, GenerateRenderOutput } from './types';
import { ENGINE_DEADLINE_MS, EngineTimeoutError } from './types';
import { generateWithNanobanana } from './nanobanana';
import { generateWithGptImage } from './gpt-image';
import { shapeOutput } from '../output-shape';
import { withDeadline } from '@/lib/server/deadline';

export {
  EngineNotConfiguredError,
  EngineTimeoutError,
  ENGINE_DEADLINE_MS,
  ENGINE_NAMES,
} from './types';
export type {
  EngineName,
  GenerateRenderInput,
  GenerateRenderOutput,
  ReferenceImage,
} from './types';

const GENERATORS: Record<
  EngineName,
  (input: GenerateRenderInput) => Promise<GenerateRenderOutput>
> = {
  nanobanana: generateWithNanobanana,
  gpt_image: generateWithGptImage,
};

const ENGINE_ENV_VARS: Record<EngineName, string> = {
  nanobanana: 'GEMINI_API_KEY',
  gpt_image: 'OPENAI_API_KEY',
};

/** Cheap upfront check so a route can 503 before doing any other work. */
export function isEngineConfigured(engine: EngineName): boolean {
  return Boolean(process.env[ENGINE_ENV_VARS[engine]]);
}

export async function generateRender(
  engine: EngineName,
  input: GenerateRenderInput,
): Promise<GenerateRenderOutput> {
  // One deadline for the whole engine call (retries and fallback included):
  // past it the engine's request is aborted and EngineTimeoutError thrown;
  // any other error comes through unchanged.
  const output = await withDeadline(
    ENGINE_DEADLINE_MS,
    (signal) => GENERATORS[engine]({ ...input, signal }),
    () => new EngineTimeoutError(engine, ENGINE_DEADLINE_MS),
  );
  // Every engine's image leaves here at the exact ratio and at least the size
  // asked for (2026-10-08, every option on both engines — see output-shape.ts).
  return shapeOutput(output, { ratio: input.aspectRatio, resolution: input.resolution });
}
