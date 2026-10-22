// Single source of truth for the render ambiances — their labels (fr/en,
// consumed by the command bar) and what kind of prompt each one gets. No
// secrets here, so this file is safe to import from a client component; it
// deliberately has no I/O and no `server-only` tag.
//
// 2026-10-10 (owner): the ambiance menu of the command bar offers four kinds
// of picture — Plan 3D aménagé, Axonométrie éclatée, Planche d'analyse,
// Maquette isométrique — plus a drawing. The four lights (day and night,
// exterior and interior) moved to the image generator page's fan, as
// templates (templates.ts). They stay valid keys here: older renders carry
// them and the landing names them.
//
// 2026-10-19 (owner's prompt audit, decisions D1–D4): the photo profiles —
// the four lights, the pencil sketch and C0 — are written on the server only
// (render-profiles.ts), with their figures, and laid out for each engine.
// What is left here is the text of the modules that change the KIND of
// picture, which never was a secret (the menu's thumbnails show it).
// « Esquisse » is now the pencil sketch the specification describes
// (`croquis`); the labelled white diagram that carried that name since
// 2026-10-10 keeps its key, `esquisse`, and is called « Schéma d'accès » —
// older renders keep their key, so an edit never mistakes one for the other.
export const PRESET_KEYS = [
  'plan_3d',
  'eclate',
  'analyse',
  'isometrie',
  'esquisse',
  'croquis',
  'jour_ext',
  'jour_int',
  'nuit_ext',
  'nuit_int',
  'maquette_blanche',
  'aquarelle',
  'heure_doree',
  'pluie',
] as const;

export type PresetKey = (typeof PRESET_KEYS)[number];

/**
 * What the ambiance menu offers, in order. The four lights joined the modules
 * on 2026-10-19 (owner: « ajoute 4 autres ambiances aux autres »): the fan's
 * templates leave the page as soon as an image is pinned, so the menu is
 * where a light is chosen for it. Four new ones the same evening (owner:
 * « go »): Maquette blanche, Aquarelle, Heure dorée, Temps de pluie — read
 * in rows of three, the modules, then the drawings, then the lights.
 */
export const AMBIANCE_KEYS = [
  'plan_3d',
  'eclate',
  'analyse',
  'isometrie',
  'maquette_blanche',
  'esquisse',
  'croquis',
  'aquarelle',
  'jour_ext',
  'jour_int',
  'nuit_ext',
  'nuit_int',
  'heure_doree',
  'pluie',
] as const satisfies readonly PresetKey[];

/**
 * How the server builds the prompt of a preset:
 * - `look`: a photo profile or the pencil sketch, assembled by
 *   render-profiles.ts (geometry lock, light, materials, photo look);
 * - `transform`: a module that changes the kind of picture, its own text
 *   under the transform lock; `keepsMaterials` when the module keeps the
 *   building's real materials (the model and the diagram have their own
 *   palette, so recorded materials would contradict them);
 * - `board`: the analysis board, sent as it was — its rework is a separate
 *   project (specification, section 2).
 */
export type PresetPrompt =
  | { kind: 'look' }
  | { kind: 'transform'; modifier: string; keepsMaterials: boolean }
  | { kind: 'board'; modifier: string };

interface PresetDef {
  label: { fr: string; en: string };
  prompt: PresetPrompt;
}

// The modifiers ask for real 3D and, where a picture means nothing without
// them, for legible labels (owner, 2026-10-10). They are written to work on
// the user's own image, whatever it is.
export const PRESETS: Record<PresetKey, PresetDef> = {
  plan_3d: {
    label: { fr: 'Plan 3D aménagé', en: 'Furnished 3D plan' },
    prompt: {
      kind: 'transform',
      keepsMaterials: true,
      modifier:
        'Transform this image into a furnished 3D floor plan in a top-down cutaway view, with the roof removed and the walls cut at a low height. Strictly preserve the real layout: room positions, wall thicknesses, doors, windows, openings and circulations exactly as shown in the source. Show only furniture, fixtures and finishes that are visible in the source image. Do not invent rooms, furniture, openings or decoration. Apply physically accurate materials with natural variation in color and roughness. Use soft, even studio lighting with gentle shadows on a clean white background. Keep proportions and scale accurate.',
    },
  },
  eclate: {
    label: { fr: 'Axonométrie éclatée', en: 'Exploded axonometric' },
    prompt: {
      kind: 'transform',
      keepsMaterials: true,
      modifier:
        'Create a detailed exploded axonometric view of the building shown in the image, separating its main layers vertically to reveal its construction logic. Strictly preserve the building’s volumes, proportions, openings and architectural character. Show only the layers that are visible or can be reasonably deduced from the image: roof, upper floors and slabs, walls and envelope, openings and glazing, ground floor, and foundations. Do not invent mechanical, electrical or structural systems that are not suggested by the project. Use realistic materials taken from the source, precise linework and light technical shading, with each layer clearly and evenly offset. Add short, clean labels only for the major elements. Present on a clean white background in a professional technical illustration style.',
    },
  },
  analyse: {
    label: { fr: 'Planche d’analyse', en: 'Concept board' },
    prompt: {
      kind: 'board',
      modifier:
        'Create an architectural analysis board on a clean white background based on the building in the image. Include a characteristic plan, a section, an axonometric diagram, and 5 small massing diagrams showing the form evolution step by step, all strictly consistent with the volumes, proportions and openings of the source image. Add material samples limited to the materials actually visible in the image. Use clean line drawings with light grey tones and minimal labels. Do not invent dimensions, text claims or architectural elements that are not present in the source. Keep the layout balanced, organized and professional.',
    },
  },
  isometrie: {
    label: { fr: 'Maquette isométrique', en: 'Isometric model' },
    prompt: {
      kind: 'transform',
      keepsMaterials: false,
      modifier:
        'Transform this image into a close-up photograph of a physical architectural scale model, shown in an isometric view. Strictly preserve the geometry, proportions, volumes, openings and composition of the source building. Build the model from clean physical materials such as white foam board, light wood and clear acrylic, with precise miniature windows and structures. Place it on a presentation table with soft studio lighting, subtle depth of field and a gentle blurred background. Do not add or remove any architectural element. Highly detailed, realistic model-making photography.',
    },
  },
  // The white axonometric diagram with labelled arrows of the menu's picture
  // (public/presets/thumb/esquisse.webp). Since 2026-10-19 its arrows may
  // only point at entrances the source shows: it used to place them freely.
  esquisse: {
    label: { fr: 'Schéma d’accès', en: 'Access diagram' },
    prompt: {
      kind: 'transform',
      keepsMaterials: false,
      modifier:
        'Create an annotated access and circulation diagram based on this image. Use a clean, simplified version of the building in light grey tones on a white background, strictly preserving its layout, volumes and openings. Overlay colored arrows showing the main entrance, secondary entrances, pedestrian circulation and vehicle access, with a distinct color for each type of flow. Mark entrances with clear symbols and add short labels for the main spaces and key transitions. Only indicate accesses that are visible or clearly implied by the source image. Add a small legend explaining colors and symbols. Keep the style minimal, clean and professional, like an architectural analysis diagram.',
    },
  },
  // A photograph of a white card-and-plaster competition model, same
  // viewpoint as the source (2026-10-19): its own palette, like the
  // isometric model, so the recorded materials are not sent.
  maquette_blanche: {
    label: { fr: 'Maquette blanche', en: 'White model' },
    prompt: {
      kind: 'transform',
      keepsMaterials: false,
      modifier:
        'Transform this image into a close-up photograph of a physical architectural scale model made entirely in white: white foam board and white card only, with no color, no realistic material textures and no wood or acrylic accents. Strictly preserve the volumes, proportions, openings and composition of the source building, with precise miniature windows and openings cut cleanly into the white surfaces. Place the model on a neutral presentation table with soft, even studio lighting and subtle shadows that emphasize the volumes. Do not add or remove any architectural element. Highly detailed, clean and minimal.',
    },
  },
  // The pencil sketch of the specification (annex A « Esquisse »), same view
  // as the source — text in render-profiles.ts.
  croquis: {
    label: { fr: 'Esquisse', en: 'Sketch' },
    prompt: { kind: 'look' },
  },
  // A watercolour illustration of the same view (render-profiles.ts).
  aquarelle: {
    label: { fr: 'Aquarelle', en: 'Watercolour' },
    prompt: { kind: 'look' },
  },
  // Two more lights, same view, nothing added (render-profiles.ts).
  heure_doree: {
    label: { fr: 'Heure dorée', en: 'Golden hour' },
    prompt: { kind: 'look' },
  },
  pluie: {
    label: { fr: 'Temps de pluie', en: 'Rainy day' },
    prompt: { kind: 'look' },
  },
  jour_ext: {
    label: { fr: 'Jour extérieur', en: 'Exterior day' },
    prompt: { kind: 'look' },
  },
  jour_int: {
    label: { fr: 'Jour intérieur', en: 'Interior day' },
    prompt: { kind: 'look' },
  },
  nuit_ext: {
    label: { fr: 'Nuit extérieur', en: 'Exterior night' },
    prompt: { kind: 'look' },
  },
  nuit_int: {
    label: { fr: 'Nuit intérieur', en: 'Interior night' },
    prompt: { kind: 'look' },
  },
};

export function isPresetKey(value: string): value is PresetKey {
  return (PRESET_KEYS as readonly string[]).includes(value);
}
