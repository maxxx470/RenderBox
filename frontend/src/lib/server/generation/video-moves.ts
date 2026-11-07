// The movements, the moving things and the intensities — the part of the
// preservation engine the BROWSER needs (2026-11-07).
//
// Split out of video-prompt.ts, which is `server-only`, for the same reason
// ambiance-text.ts is client-safe: the command bar shows these names and
// prices the request before the click. The English sentences travel with
// their labels on purpose — what the user picks and what the engine is told
// must be one object, so a renamed label can never drift from the
// instruction it sends.
//
// buildVideoPrompt stays server-side: the browser chooses keys, never a
// prompt. The server assembles the preservation block, the camera, the
// environment and the user's words in the order that matters.

/**
 * The twelve camera movements of the owner's brief.
 *
 * The brief is explicit that these are not controls: « Ces mouvements
 * doivent être traduits en instructions adaptées au modèle sélectionné. Ils
 * ne doivent pas être présentés comme des contrôles physiques garantis. »
 * So the interface says the movement is asked for, never that it is applied.
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
 * What the engine is allowed to move besides the camera. Everything here is
 * OUTSIDE the building: the whole point is that the architecture stays still
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
  people: {
    fr: 'Personnes',
    en: 'People',
    prompt: 'a few people walking naturally at a distance',
  },
  vehicles: {
    fr: 'Véhicules',
    en: 'Vehicles',
    prompt: 'vehicles moving slowly along the road',
  },
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

/** How much anything may move. Three named steps, never a 0–100 slider —
 *  the same choice the Enhance page already makes for its intensity. */
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
export const INTENSITY_KEYS = Object.keys(ANIMATION_INTENSITY) as IntensityKey[];
