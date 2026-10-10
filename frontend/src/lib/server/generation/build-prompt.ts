// Assembles the final prompt sent to the AI engine, in a fixed order:
// 1) the project's materials sheet (Phase 2) — consistency constraints
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
import { PHOTO_RENDER_MODIFIER, PRESETS, type PresetKey } from './presets';

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

  if (input.materialsSnapshot.length > 0) {
    parts.push(
      'Keep these materials consistent with the source photo:',
      ...input.materialsSnapshot.map((m) => `- ${m.face}: ${m.valeur}`),
    );
  }

  if (input.preset) parts.push(PRESETS[input.preset].promptModifier);
  else if (input.photoRender) parts.push(PHOTO_RENDER_MODIFIER);

  if (input.customPrompt?.trim()) {
    parts.push(input.customPrompt.trim());
  }

  return parts.join('\n');
}
