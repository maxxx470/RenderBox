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
        'Turn the attached 2D floor plan into a photorealistic top-down 3D render of the furnished home, seen from directly above with the roof removed. Keep exactly the walls, doors, windows and room layout of the plan. Walls are cut and shown in solid black. Furnish every room in a warm, premium contemporary style: herringbone oak floors, a bedroom with a made bed, bedside tables and warm glowing lamps, a bathroom with a walk-in shower and a vanity, a kitchen with worktops and an island, a dining table with chairs, a living room with a sofa, an armchair, a rug and a coffee table, potted plants in the corners. Soft natural light falling through the windows with gentle shadows, and warm accent lighting. Add three or four people seen from above, to scale and naturally placed. No text, no labels, no dimensions, no room names.',
    },
  },
  eclate: {
    label: { fr: 'Axonométrie éclatée', en: 'Exploded axonometric' },
    prompt: {
      kind: 'transform',
      keepsMaterials: true,
      modifier:
        'Turn the building in the attached image into a highly detailed exploded axonometric 3D illustration: a realistic 3D model, not a flat drawing, seen from a high 30-degree angle on a clean white background. Pull the building apart vertically into its construction layers, stacked one above another with even gaps and thin dashed vertical alignment lines between them, from bottom to top: foundations resting on a cut block of earth with a grass edge, structural frame (columns and beams), each floor slab with its interior walls, stairs and tiny furniture, insulation, facade cladding panels, windows and glazing panes, roof structure with timber rafters, roof covering with its skylights. Keep the building’s real shape, proportions, materials and colours, rendered realistically with soft shadows and ambient occlusion. Add clean architectural labels: thin black leader lines from each layer to a short uppercase label in a clean sans-serif font, aligned in a neat column on the right (for example ROOF, ROOF STRUCTURE, GLAZING, CLADDING, INSULATION, SECOND FLOOR, FIRST FLOOR, GROUND FLOOR, STRUCTURAL FRAME, FOUNDATIONS). Every label crisp, legible and spelled correctly, each word written once. High-end technical cutaway illustration style.',
    },
  },
  analyse: {
    label: { fr: 'Planche d’analyse', en: 'Concept board' },
    prompt: {
      kind: 'board',
      modifier:
        'Create an architecture concept analysis board of the building in the attached image, on a clean white background, in the style of an international architecture competition presentation. Precise grid layout with generous white space: a bold title CONCEPT ANALYSIS with the project’s name under it in light uppercase; a large realistic photographic view of the building in its landscape; its characteristic floor plan in fine black linework labelled FLOOR PLAN, with a north arrow and a scale bar; a long section through the building and the ground labelled SECTION; a row of five small white 3D massing diagrams showing step by step how the form evolved, each numbered with a one-word caption (for example 1 VOLUME, 2 SPLIT, 3 SHIFT, 4 OPEN, 5 TERRACE); a strip of five square samples of the building’s real materials, each with its name in small uppercase below it. Thin hairline dividers and no other text: no small annotations, no dimensions. All text crisp, legible and spelled correctly in a clean sans-serif font, each word written once. Muted palette: white, light grey, concrete, warm wood, one soft accent colour. Professional, print-ready.',
    },
  },
  isometrie: {
    label: { fr: 'Maquette isométrique', en: 'Isometric model' },
    prompt: {
      kind: 'transform',
      keepsMaterials: false,
      modifier:
        'Turn the project in the attached image into a clean isometric 3D architectural model, seen from a high 30-degree isometric angle on a very light grey ground crossed by subtle dotted halftone bands. Keep the building’s real volumes, layout, stairs and terraces. Render it like a high-end physical competition model: white card volumes with light birch timber frames, slats and pergolas, smooth pale grey concrete for plinths, walkways and stairs, frosted white glass for roofs and glazing, crisp edges. About fifteen tiny white abstract human figures walking and standing, to scale. Soft even daylight from the top left, gentle ambient occlusion and soft shadows. Muted palette of warm wood, white and light grey only. No trees, no background scenery, no text.',
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
        'Render the building in the attached image as a clean architectural presentation diagram: an all-white matte 3D massing model seen from a high axonometric angle, crisp edges, soft ambient-occlusion shadows, on a very light grey ground. Keep the building’s real shape, openings, terraces and roof. Show the site in the same white and light grey: the street, the plot, the neighbouring plots as plain white blocks, a few simple trees and white palms, a roof garden where the roof is planted, and tiny white human figures to scale. Add thin black arrows with short labels in a clean sans-serif font pointing to the entrances and the main outdoor spaces (for example MAIN ENTRANCE, CAR ENTRANCE, BACK YARD ENTRANCE, ROOF GARDEN), and STREET ACCESS written along the street; point only at entrances and spaces visible in the source image, never at invented ones. No photorealistic materials or textures, no colours except a touch of warm terracotta or copper on the ground floor. Every label crisp, legible and spelled correctly.',
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
        'Turn the building in the attached image into a photograph of a physical white architectural presentation model, seen from the same viewpoint and framing as the source: matte white card and plaster for every volume, wall and roof, clear acrylic for the glazing, crisp laser-cut edges with fine visible joints, every opening cut out where the source has it. Set it on a thick base of pale birch plywood with the site’s lines and paths finely engraved into it, a few small flocked wire trees in white and tiny white human figures to scale. Soft studio light from the top left, gentle shadows and ambient occlusion, plain light grey studio background, shallow depth of field like a close-up photograph of a model. No colours, no realistic materials, no text.',
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
