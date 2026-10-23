// The prompt of a render WITHOUT an ambiance (C0, a faithful photo render),
// built on the server from structured parameters only — the client sends the
// user's own words, never a prompt (2026-10-19, the owner's prompt audit, D1).
// render-profiles.ts's lookSpec('source'): geometry lock, the request, the
// source's own light, the materials, the photo look, what to avoid, the final
// check; then formatPrompt lays it out for the engine that will read it.
//
// A render WITH an ambiance (the fourteen of the menu and the fan's templates)
// gets the specification's prompt instead (spec-prompts.ts, 2026-10-23: the
// texts of the « Spécification des prompts », filled by the code, no Claude
// analysis); the user's words — their version of the bar's text, their
// request — come after its defaults.
//
// A material is data, never an instruction: its face and its value are each
// put on ONE line (toPromptLine), so a line break typed or detected inside a
// value cannot start a line of its own in the prompt. A material whose face
// or value is blank once flattened says nothing and is left out; with no line
// left, the header goes too.
import 'server-only';
import type { EngineName } from './engines/types';
import { formatPrompt, lookSpec, toPromptLine, type SheetRequest } from './render-profiles';
import type { PresetKey } from './presets';
import type { SkyOption } from './templates';
import { ambianceText as defaultAmbianceText } from './ambiance-text';
import { ambiancePrompt, userText } from './spec-prompts';

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
  /** The ambiance or the template's key; null or absent: no ambiance (C0). */
  preset?: PresetKey | null | undefined;
  /** Exterior day only: lightly hazy (default) or direct sun. */
  sky?: SkyOption | undefined;
  customPrompt?: string | undefined;
  /** The ambiance's text as the user left it in the bar: used only when it
   *  differs from the text the ambiance writes itself. */
  ambianceText?: string | undefined;
  /** A materials sheet pasted under the prompt (2026-10-19). */
  sheet?: SheetRequest | undefined;
}): string {
  if (input.preset) {
    const edited =
      input.ambianceText &&
      toPromptLine(input.ambianceText) !==
        toPromptLine(defaultAmbianceText(input.preset, input.sky))
        ? input.ambianceText
        : undefined;
    return ambiancePrompt({
      preset: input.preset,
      sky: input.sky,
      materials: input.materialsSnapshot,
      sheet: input.sheet,
      request: userText(edited, input.customPrompt),
    });
  }
  return formatPrompt(
    input.engine,
    lookSpec({
      request: input.customPrompt,
      sheet: input.sheet,
      materials: input.materialsSnapshot,
    }),
  );
}
