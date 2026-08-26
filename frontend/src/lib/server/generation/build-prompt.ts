// Assembles the final prompt sent to the AI engine, in a fixed order:
// 1) the project's materials sheet (Phase 2) — consistency constraints
// 2) the preset's ambiance/style modifier (Phase 3)
// 3) the user's optional free-text detail
//
// The materials section is ALWAYS included, even for the "esquisse" preset —
// a sketch of a timber-clad wall must still read as timber, just drawn
// differently. Only the rendering style changes with the preset, never the
// building's material memory.
import { PRESETS, type PresetKey } from './presets';

export interface MaterialSnapshotEntry {
  face: string;
  valeur: string;
  source: string;
  confidence: number | null;
}

export function buildGenerationPrompt(input: {
  materialsSnapshot: MaterialSnapshotEntry[];
  preset: PresetKey;
  customPrompt?: string | undefined;
}): string {
  const parts: string[] = [];

  if (input.materialsSnapshot.length > 0) {
    parts.push(
      'Keep these materials consistent with the source photo:',
      ...input.materialsSnapshot.map((m) => `- ${m.face}: ${m.valeur}`),
    );
  }

  parts.push(PRESETS[input.preset].promptModifier);

  if (input.customPrompt?.trim()) {
    parts.push(input.customPrompt.trim());
  }

  return parts.join('\n');
}
