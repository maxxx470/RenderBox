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

/**
 * The twelve camera movements of the brief. Each is a KEY plus the sentence
 * sent to the engine — the user picks a name, never types the English.
 *
 * The brief is explicit that these are not controls: « Ces mouvements doivent
 * être traduits en instructions adaptées au modèle sélectionné. Ils ne doivent
 * pas être présentés comme des contrôles physiques garantis. » So the
 * interface says « mouvement demandé », not « mouvement appliqué ».
 */
export const CAMERA_MOVES = {
  static: {
    fr: 'Caméra fixe',
    en: 'Static camera',
    prompt: 'The camera remains completely static, locked on a tripod. No camera movement at all.',
  },
  push_in: {
    fr: 'Avancée lente',
    en: 'Slow push in',
    prompt: 'The camera slowly pushes in towards the building on a straight dolly track.',
  },
  pull_out: {
    fr: 'Recul lent',
    en: 'Slow pull out',
    prompt:
      'The camera slowly pulls back from the building on a straight dolly track, revealing more of the scene.',
  },
  pan_left: {
    fr: 'Panoramique gauche',
    en: 'Pan left',
    prompt: 'The camera pans slowly to the left from a fixed position.',
  },
  pan_right: {
    fr: 'Panoramique droite',
    en: 'Pan right',
    prompt: 'The camera pans slowly to the right from a fixed position.',
  },
  tilt_up: {
    fr: 'Inclinaison vers le haut',
    en: 'Tilt up',
    prompt:
      'The camera tilts slowly upward from a fixed position, following the height of the building.',
  },
  tilt_down: {
    fr: 'Inclinaison vers le bas',
    en: 'Tilt down',
    prompt: 'The camera tilts slowly downward from a fixed position, towards the ground level.',
  },
  orbit_left: {
    fr: 'Orbite vers la gauche',
    en: 'Orbit left',
    prompt:
      'The camera orbits slowly around the building towards the left, keeping the building centred in frame.',
  },
  orbit_right: {
    fr: 'Orbite vers la droite',
    en: 'Orbit right',
    prompt:
      'The camera orbits slowly around the building towards the right, keeping the building centred in frame.',
  },
  drone: {
    fr: 'Survol en drone',
    en: 'Drone flyover',
    prompt: 'An aerial drone shot flying smoothly over the building, gaining altitude.',
  },
  dolly: {
    fr: 'Travelling cinématique',
    en: 'Cinematic dolly',
    prompt:
      'A smooth cinematic dolly movement with a slight lateral drift, in the style of an architectural film.',
  },
  walkthrough: {
    fr: 'Visite architecturale',
    en: 'Architectural walkthrough',
    prompt:
      'A steady walkthrough moving forward through the architectural space at human eye level.',
  },
} as const;

export type CameraMoveKey = keyof typeof CAMERA_MOVES;
export const CAMERA_MOVE_KEYS = Object.keys(CAMERA_MOVES) as CameraMoveKey[];

/**
 * What the engine is allowed to move, besides the camera. Everything here is
 * outside the building: the whole point is that the architecture stays still
 * while the world around it does not.
 */
export const ENVIRONMENT_ELEMENTS = {
  trees: { fr: 'Arbres', en: 'Trees', prompt: 'tree branches swaying gently in the wind' },
  leaves: {
    fr: 'Feuillage',
    en: 'Leaves',
    prompt: 'leaves rustling and a few drifting through the air',
  },
  grass: { fr: 'Herbe', en: 'Grass', prompt: 'grass moving softly in the breeze' },
  clouds: { fr: 'Nuages', en: 'Clouds', prompt: 'clouds drifting slowly across the sky' },
  sky: { fr: 'Ciel dynamique', en: 'Dynamic sky', prompt: 'subtle changes of light in the sky' },
  water: {
    fr: 'Eau et piscine',
    en: 'Water and pool',
    prompt: 'water surfaces rippling, pool water moving gently',
  },
  reflections: {
    fr: 'Reflets',
    en: 'Reflections',
    prompt: 'natural reflections shifting on glass and water',
  },
  people: { fr: 'Personnes', en: 'People', prompt: 'a few people walking naturally at a distance' },
  vehicles: { fr: 'Véhicules', en: 'Vehicles', prompt: 'vehicles moving slowly along the road' },
  curtains: {
    fr: 'Rideaux',
    en: 'Curtains',
    prompt: 'curtains breathing slightly near open windows',
  },
  atmosphere: {
    fr: 'Lumière et atmosphère',
    en: 'Light and atmosphere',
    prompt: 'soft atmospheric light and haze',
  },
} as const;

export type EnvironmentKey = keyof typeof ENVIRONMENT_ELEMENTS;
export const ENVIRONMENT_KEYS = Object.keys(ENVIRONMENT_ELEMENTS) as EnvironmentKey[];

/** How much anything is allowed to move. Three named steps, never a 0–100
 *  slider — the same choice the Enhance page already makes. */
export const ANIMATION_INTENSITY = {
  subtle: {
    fr: 'Subtile',
    en: 'Subtle',
    prompt: 'Keep all motion extremely subtle and restrained.',
  },
  natural: {
    fr: 'Naturelle',
    en: 'Natural',
    prompt: 'Keep all motion natural and realistic in speed.',
  },
  dynamic: {
    fr: 'Marquée',
    en: 'Dynamic',
    prompt: 'Allow more pronounced motion, while keeping it physically believable.',
  },
} as const;

export type IntensityKey = keyof typeof ANIMATION_INTENSITY;

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
