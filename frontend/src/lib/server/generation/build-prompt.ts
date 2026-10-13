// Assembles the final prompt sent to the AI engine, in a fixed order:
// 1) the materials of the source image (étape 3C.3: its detections and the
//    user's corrections on it, resolved) — consistency constraints; the
//    header says so ("…for this source image")
// 2) the preset's ambiance/style modifier (Phase 3) — none for a template
//    (templates.ts): its prompt already says what the image is. With neither
//    an ambiance nor a template (the menu's "Sans ambiance", 2026-10-10), a
//    faithful photo render instead (PHOTO_RENDER_MODIFIER)
// 3) the user's optional free-text detail
//
// The materials section is ALWAYS included, even for the "esquisse" preset —
// a sketch of a timber-clad wall must still read as timber, just drawn
// differently. Only the rendering style changes with the preset, never the
// building's material memory.
//
// A material is data, never an instruction: its face and its value are each
// put on ONE line (toPromptLine), so a line break typed or detected inside a
// value cannot start a line of its own in the prompt. A material whose face
// or value is blank once flattened says nothing and is left out (the same
// rule as resolve.ts for a blank detection); with no line left, the header
// goes too.
import { PHOTO_RENDER_MODIFIER, PRESETS, type PresetKey } from './presets';

// Every character a model may read as a line break — LF, CR (alone or in
// CRLF), vertical tab, form feed, NEL, LINE SEPARATOR, PARAGRAPH SEPARATOR —
// with the spaces or tabs around it; a run of them counts as one.
const LINE_BREAKS = /[\t ]*(?:[\n\r\v\f\u0085\u2028\u2029][\t ]*)+/g;

/** A material field as one line of prompt text: each run of line breaks becomes one space, ends trimmed. */
export function toPromptLine(text: string): string {
  return text.replace(LINE_BREAKS, ' ').trim();
}

export interface MaterialSnapshotEntry {
  face: string;
  valeur: string;
  source: string;
  confidence: number | null;
}

export function buildGenerationPrompt(input: {
  materialsSnapshot: MaterialSnapshotEntry[];
  /** null for a generation started from a template. */
  preset: PresetKey | null;
  customPrompt?: string | undefined;
  /** No ambiance and no template: ask for a faithful photo render. */
  photoRender?: boolean;
}): string {
  const parts: string[] = [];

  const materialLines = input.materialsSnapshot
    .map((m) => ({ face: toPromptLine(m.face), valeur: toPromptLine(m.valeur) }))
    .filter((m) => m.face !== '' && m.valeur !== '')
    .map((m) => `- ${m.face}: ${m.valeur}`);
  if (materialLines.length > 0) {
    parts.push(
      "Materials recorded for this source image. Preserve each listed material by default. If the user's request explicitly changes a listed material, apply the requested change only to that material; preserve every other listed material unchanged unless the user explicitly requests otherwise:",
      ...materialLines,
    );
  }

  if (input.preset) parts.push(PRESETS[input.preset].promptModifier);
  else if (input.photoRender) parts.push(PHOTO_RENDER_MODIFIER);

  if (input.customPrompt?.trim()) {
    parts.push(input.customPrompt.trim());
  }

  return parts.join('\n');
}
