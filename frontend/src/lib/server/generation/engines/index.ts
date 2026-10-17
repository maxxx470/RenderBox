// Single entry point for render generation — the ONLY place that dispatches
// on engine name. Route handlers must always call generateRender()/
// isEngineConfigured(); no `if (engine === ...)` branching anywhere else.
//
// Since 2026-10-15 an engine has versions (engine-versions.ts), all run
// through Kie (kie.ts) once KIE_API_KEY is set; the routes ask
// resolveEngineVersion() which one applies. Without the key, or when Kie's
// account refuses (bad key, no credits), the engine's direct API runs as
// before — a forgotten top-up never stops every render.
import 'server-only';
import type { EngineName, GenerateRenderInput, GenerateRenderOutput } from './types';
import { ENGINE_DEADLINE_MS, EngineTimeoutError } from './types';
import { generateWithNanobanana } from './nanobanana';
import { generateWithGptImage } from './gpt-image';
import { generateWithKie, isKieAccountError, isKieConfigured } from './kie';
import { DEFAULT_ENGINE_VERSION, type EngineVersionKey } from '../engine-versions';
import { shapeOutput } from '../output-shape';
import { withDeadline } from '@/lib/server/deadline';
import { log } from '@/lib/server/observability/log';

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

function hasDirectKey(engine: EngineName): boolean {
  return Boolean(process.env[ENGINE_ENV_VARS[engine]]);
}

/** Cheap upfront check so a route can 503 before doing any other work. */
export function isEngineConfigured(engine: EngineName): boolean {
  return hasDirectKey(engine) || isKieConfigured();
}

/**
 * The version a request runs on: the engine's one version
 * (DEFAULT_ENGINE_VERSION) — or none while Kie is not configured, which runs
 * the direct API. A version sent by an older page is ignored (2026-10-17: no
 * choice any more).
 */
export function resolveEngineVersion(
  engine: EngineName,
  _asked?: EngineVersionKey | null,
): EngineVersionKey | undefined {
  if (!isKieConfigured()) return undefined;
  return DEFAULT_ENGINE_VERSION[engine];
}

async function run(
  engine: EngineName,
  input: GenerateRenderInput,
  signal: AbortSignal,
): Promise<GenerateRenderOutput> {
  const { version, ...direct } = input;
  if (!version) return GENERATORS[engine]({ ...direct, signal });
  try {
    const out = await generateWithKie(version, { ...input, signal });
    return { ...out, engineVersion: version };
  } catch (err) {
    if (!isKieAccountError(err) || !hasDirectKey(engine)) throw err;
    log.error('kie: account refused (key or credits), falling back to the direct engine', {
      engine,
      version,
      code: err.code,
    });
    return GENERATORS[engine]({ ...direct, signal });
  }
}

export async function generateRender(
  engine: EngineName,
  input: GenerateRenderInput,
): Promise<GenerateRenderOutput> {
  // One deadline for the whole engine call (retries, Kie's polling and the
  // fallbacks included): past it the engine's request is aborted and
  // EngineTimeoutError thrown; any other error comes through unchanged.
  const output = await withDeadline(
    ENGINE_DEADLINE_MS,
    (signal) => run(engine, input, signal),
    () => new EngineTimeoutError(engine, ENGINE_DEADLINE_MS),
  );
  // Every engine's image leaves here at the exact ratio and at least the size
  // asked for (2026-10-08, every option on both engines — see output-shape.ts).
  const shaped = await shapeOutput(output, {
    ratio: input.aspectRatio,
    resolution: input.resolution,
  });
  return {
    ...shaped,
    ...(output.engineVersion ? { engineVersion: output.engineVersion } : {}),
    ...(output.providerCredits !== undefined ? { providerCredits: output.providerCredits } : {}),
  };
}
