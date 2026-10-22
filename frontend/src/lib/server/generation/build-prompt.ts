// The prompt of a render WITHOUT an ambiance (C0, a faithful photo render),
// built on the server from structured parameters only — the client sends the
// user's own words, never a prompt (2026-10-19, the owner's prompt audit, D1).
// render-profiles.ts's lookSpec('source'): geometry lock, the request, the
// source's own light, the materials, the photo look, what to avoid, the final
// check; then formatPrompt lays it out for the engine that will read it.
//
// Since 2026-10-22 every render WITH an ambiance (the fourteen of the menu
// and the fan's templates) goes through the Claude analysis instead
// (lib/server/analysis/), which replaced the prompts v2 of 2026-10-20.
//
// A material is data, never an instruction: its face and its value are each
// put on ONE line (toPromptLine), so a line break typed or detected inside a
// value cannot start a line of its own in the prompt. A material whose face
// or value is blank once flattened says nothing and is left out; with no line
// left, the header goes too.
import 'server-only';
import type { EngineName } from './engines/types';
import { formatPrompt, lookSpec, toPromptLine, type SheetRequest } from './render-profiles';

export { toPromptLine };

export interface MaterialSnapshotEntry {
  face: string;
  valeur: string;
  source: string;
  confidence: number | null;
}

export function buildGenerationPrompt(input: {
  engine: EngineName;
  materialsSnapshot: readonly MaterialSnapshotEntry[];
  customPrompt?: string | undefined;
  /** A materials sheet pasted under the prompt (2026-10-19). */
  sheet?: SheetRequest | undefined;
}): string {
  return formatPrompt(
    input.engine,
    lookSpec({
      request: input.customPrompt,
      sheet: input.sheet,
      materials: input.materialsSnapshot,
    }),
  );
}
