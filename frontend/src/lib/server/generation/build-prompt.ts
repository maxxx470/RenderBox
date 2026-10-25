// The prompt of a render WITHOUT an ambiance (C0, a faithful photo render),
// built on the server from structured parameters only — the client sends the
// user's own words, never a prompt (2026-10-19, the owner's prompt audit, D1).
// render-profiles.ts's lookSpec('source'): geometry lock, the request, the
// source's own light, the materials, the photo look, what to avoid, the final
// check; then formatPrompt lays it out for the engine that will read it.
//
// A render WITH an ambiance (the fourteen of the menu and the fan's templates)
// is sent the owner's dictated prompt for that ambiance, in the language the
// site is being read in (ambiance-prompts.ts, 2026-10-25) — or the user's own
// version of it when they changed it in the bar, since the bar shows the
// prompt itself. Their separate request, if any, comes after it.
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
import type { Locale } from '@/lib/i18n/dictionaries';
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
  /** The language the ambiance's prompt is written in. */
  locale: Locale;
  customPrompt?: string | undefined;
  /** The ambiance's text as the user left it in the bar: used only when it
   *  differs from the text the ambiance writes itself. */
  ambianceText?: string | undefined;
  /** A materials sheet pasted under the prompt (2026-10-19). */
  sheet?: SheetRequest | undefined;
}): string {
  if (input.preset) {
    // Left as the ambiance wrote it, the owner's text is sent as it is;
    // changed, the user's version takes its place — the bar showed them the
    // prompt, so what they read is what runs.
    const written = input.ambianceText?.trim();
    const edited =
      written && written !== defaultAmbianceText(input.preset, input.locale).trim()
        ? written
        : undefined;
    return ambiancePrompt({
      preset: input.preset,
      locale: input.locale,
      materials: input.materialsSnapshot,
      sheet: input.sheet,
      request: userText(input.customPrompt),
      ...(edited ? { text: edited } : {}),
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
