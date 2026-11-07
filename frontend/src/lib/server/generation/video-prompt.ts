// The Architectural Preservation Engine (2026-11-07, owner's « Cahier de
// référence — AI VIDEO GENERATION », section 5).
//
// This is what separates RenderPro from a general-purpose video generator:
// the user's render is not a suggestion, it is the building. The owner's
// priority, in their words: « La priorité absolue est la préservation de
// l'architecture originale. L'IA doit animer le rendu sans réinterpréter
// librement le bâtiment. »
//
// PRESERVATION_PROMPT and PRESERVATION_NEGATIVE below are the owner's own
// text, integrated verbatim. The same rule as the fourteen ambiance prompts
// applies: they are never reworded, shortened, re-translated or « improved ».
// Only the owner changes them. They are in English because every one of the
// six endpoints is prompted in English, whatever the site's language.
//
// And the honest part, which the owner wrote into the brief themselves:
// « Aucun modèle ne garantit une conservation parfaite de la géométrie. » This
// module makes deformation less likely. It does not make it impossible, and
// nothing in the interface may claim that it does.
import 'server-only';
import { VIDEO_MODELS, type VideoModelKey } from './video-models';
import {
  ANIMATION_INTENSITY,
  CAMERA_MOVES,
  ENVIRONMENT_ELEMENTS,
  type CameraMoveKey,
  type EnvironmentKey,
  type IntensityKey,
} from './video-moves';

/** The owner's preservation block, word for word. */
export const PRESERVATION_PROMPT = `Use the uploaded architectural render as the exact visual and structural reference.
Preserve the original building exactly as shown.
Do not redesign, reconstruct, reinterpret, modify, or distort the architecture.
Maintain the exact geometry, proportions, dimensions, facade composition, roof shape, slabs, columns, beams, windows, doors, openings, materials, textures, furniture, and structural elements.
Do not add, remove, resize, or relocate architectural components.
Preserve the original camera perspective and composition unless a camera movement is explicitly requested.
Animate only the requested camera movement and environmental elements.
Keep the building structurally stable and visually consistent throughout every frame.
The result must look like a cinematic architectural visualization based on the original render, not a newly designed building.`;

/** The owner's negative block, word for word. */
export const PRESERVATION_NEGATIVE = `architectural deformation, distorted facade, changing geometry, warped walls, deformed windows, additional openings, missing columns, changing roof shape, floating objects, morphing building, unstable perspective, material replacement, structural inconsistency, flickering, unwanted objects, unrealistic movement.`;

// The three catalogues live in video-moves.ts, which carries no
// `server-only`: the command bar shows their names and prices the request
// before the click. They are re-exported here so every existing caller — and
// every reader looking for the preservation engine — still finds them beside
// the block they are assembled into.
export {
  ANIMATION_INTENSITY,
  CAMERA_MOVES,
  CAMERA_MOVE_KEYS,
  ENVIRONMENT_ELEMENTS,
  ENVIRONMENT_KEYS,
  INTENSITY_KEYS,
  type CameraMoveKey,
  type EnvironmentKey,
  type IntensityKey,
} from './video-moves';

export interface VideoPromptInput {
  model: VideoModelKey;
  camera: CameraMoveKey;
  environment: readonly EnvironmentKey[];
  intensity: IntensityKey;
  /** The user's own words, optional, appended last and never overriding a lock. */
  request?: string | undefined;
}

export interface BuiltVideoPrompt {
  prompt: string;
  /** Only for the engines that take one. Null means the negatives were folded
   *  into `prompt` instead, so a caller cannot forget them. */
  negativePrompt: string | null;
}

/**
 * Assemble the prompt actually sent. Order matters and is deliberate: the
 * preservation block FIRST, because every engine weights its opening
 * strongest; then what may move; then the user's words LAST, so their request
 * is read in the context of the lock rather than before it.
 *
 * Engines with no negative-prompt field (five of the six) get the negatives
 * as an « Avoid: » line inside the prompt — dropping them there would quietly
 * remove the half of the preservation engine that names the failure modes.
 */
export function buildVideoPrompt(input: VideoPromptInput): BuiltVideoPrompt {
  const camera = CAMERA_MOVES[input.camera];
  const intensity = ANIMATION_INTENSITY[input.intensity];

  const moving = input.environment.map((k) => ENVIRONMENT_ELEMENTS[k].prompt);
  const environmentLine =
    moving.length > 0
      ? `Animate these environmental elements only: ${moving.join('; ')}.`
      : 'Do not animate any environmental element. Only the camera may move.';

  const sections = [
    PRESERVATION_PROMPT,
    `CAMERA: ${camera.prompt}`,
    `ENVIRONMENT: ${environmentLine}`,
    `MOTION: ${intensity.prompt}`,
  ];

  const request = input.request?.trim();
  if (request) sections.push(`User request: ${request}`);

  const takesNegative = VIDEO_MODELS[input.model].capabilities.negativePrompt;
  if (!takesNegative) sections.push(`Avoid: ${PRESERVATION_NEGATIVE}`);

  return {
    prompt: sections.join('\n\n'),
    negativePrompt: takesNegative ? PRESERVATION_NEGATIVE : null,
  };
}
