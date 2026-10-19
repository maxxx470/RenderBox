// Assembles the prompt of a generation (Générer) on the server, from
// structured parameters only — the client sends a preset or template key, an
// optional sky, an engine and the user's own words, never a prompt
// (2026-10-19, the owner's prompt audit, D1).
//
// - A light profile (a fan template or an old light ambiance), no ambiance
//   (C0) or the pencil sketch: render-profiles.ts's lookSpec — geometry
//   lock, the request, the light, the materials, the photo look, what to
//   avoid, the final check.
// - A module that changes the kind of picture (3D plan, exploded view,
//   model, access diagram): transformSpec — the transform lock, the request,
//   the module's own text, the recorded materials where the module keeps
//   them.
// - The analysis board: the text it always had (materials, modifier, the
//   user's words), untouched — its rework is a separate project.
// Then formatPrompt lays the spec out for the engine that will read it.
//
// A material is data, never an instruction: its face and its value are each
// put on ONE line (toPromptLine), so a line break typed or detected inside a
// value cannot start a line of its own in the prompt. A material whose face
// or value is blank once flattened says nothing and is left out; with no line
// left, the header goes too.
import 'server-only';
import type { EngineName } from './engines/types';
import { PRESETS, type PresetKey } from './presets';
import {
  formatPrompt,
  lookSpec,
  toPromptLine,
  transformSpec,
  type LookKey,
  type SkyKey,
} from './render-profiles';

export { toPromptLine };

export interface MaterialSnapshotEntry {
  face: string;
  valeur: string;
  source: string;
  confidence: number | null;
}

/** The analysis board's own header, as it was before the audit. */
const BOARD_MATERIALS_HEADER =
  "Materials recorded for this source image. Preserve each listed material by default. If the user's request explicitly changes a listed material, apply the requested change only to that material; preserve every other listed material unchanged unless the user explicitly requests otherwise:";

function boardPrompt(
  modifier: string,
  materials: readonly MaterialSnapshotEntry[],
  customPrompt: string | undefined,
): string {
  const parts: string[] = [];
  const lines = materials
    .map((m) => ({ face: toPromptLine(m.face), valeur: toPromptLine(m.valeur) }))
    .filter((m) => m.face !== '' && m.valeur !== '')
    .map((m) => `- ${m.face}: ${m.valeur}`);
  if (lines.length > 0) parts.push(BOARD_MATERIALS_HEADER, ...lines);
  parts.push(modifier);
  if (customPrompt?.trim()) parts.push(customPrompt.trim());
  return parts.join('\n');
}

export function buildGenerationPrompt(input: {
  engine: EngineName;
  materialsSnapshot: readonly MaterialSnapshotEntry[];
  /** The ambiance or the template's key; null: no ambiance (C0). */
  preset: PresetKey | null;
  /** Exterior day only: lightly hazy (default) or direct sun. */
  sky?: SkyKey | undefined;
  customPrompt?: string | undefined;
}): string {
  const { engine, materialsSnapshot: materials, customPrompt } = input;
  const def = input.preset ? PRESETS[input.preset].prompt : null;

  if (def?.kind === 'board') return boardPrompt(def.modifier, materials, customPrompt);

  if (def?.kind === 'transform') {
    return formatPrompt(
      engine,
      transformSpec({
        representation: def.modifier,
        request: customPrompt,
        materials: def.keepsMaterials ? materials : [],
      }),
    );
  }

  const look: LookKey =
    input.preset === null
      ? 'source'
      : input.preset === 'croquis'
        ? 'sketch'
        : lookKey(input.preset);
  return formatPrompt(engine, lookSpec({ look, sky: input.sky, request: customPrompt, materials }));
}

function lookKey(preset: PresetKey): LookKey {
  switch (preset) {
    case 'jour_ext':
    case 'jour_int':
    case 'nuit_ext':
    case 'nuit_int':
      return preset;
    case 'heure_doree':
      return 'golden';
    case 'pluie':
      return 'rain';
    case 'aquarelle':
      return 'watercolour';
    default:
      // Every other `look` preset is listed above; a new one must be mapped.
      throw new Error(`no look for preset ${preset}`);
  }
}
