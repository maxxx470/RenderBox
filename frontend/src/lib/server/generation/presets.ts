// Single source of truth for the render ambiances — labels (fr/en, consumed
// by CommandBar) and prompt modifiers (consumed by build-prompt.ts). No
// secrets here, so this file is safe to import from a client component; it
// deliberately has no I/O and no `server-only` tag.
//
// 2026-10-10 (owner): the ambiance menu of the command bar now offers four
// kinds of picture — Plan 3D aménagé, Axonométrie éclatée, Planche
// d'analyse, Maquette isométrique — plus Esquisse. The four lights (day and
// night, exterior and interior) moved to the image generator page's fan, as
// templates with their own prompt (templates.ts). They stay valid keys here:
// older renders carry them, the landing names them, and an edit of such a
// render relights it the same way.
export const PRESET_KEYS = [
  'plan_3d',
  'eclate',
  'analyse',
  'isometrie',
  'esquisse',
  'jour_ext',
  'jour_int',
  'nuit_ext',
  'nuit_int',
] as const;

export type PresetKey = (typeof PRESET_KEYS)[number];

/** What the ambiance menu offers, in order. */
export const AMBIANCE_KEYS = [
  'plan_3d',
  'eclate',
  'analyse',
  'isometrie',
  'esquisse',
] as const satisfies readonly PresetKey[];

interface PresetDef {
  label: { fr: string; en: string };
  promptModifier: string;
  /**
   * Whether an edit (Ajouter, a zone change) of a render made with this
   * ambiance applies it again. True for a light or a drawing style; false
   * for a transformation ("turn the plan into a 3D view") — run again on its
   * own result it would transform a second time.
   */
  reapplyOnEdit: boolean;
}

// The modifiers ask for real 3D and, where a picture means nothing without
// them, for legible labels (owner, 2026-10-10). They are written to work on
// the user's own image, whatever it is.
export const PRESETS: Record<PresetKey, PresetDef> = {
  plan_3d: {
    label: { fr: 'Plan 3D aménagé', en: 'Furnished 3D plan' },
    reapplyOnEdit: false,
    promptModifier:
      'Turn the attached 2D floor plan into a photorealistic top-down 3D render of the furnished home, seen from directly above with the roof removed. Keep exactly the walls, doors, windows and room layout of the plan. Furnish every room in a warm, premium contemporary style: herringbone oak floors, a bedroom with a made bed and bedside lamps, a bathroom with a walk-in shower and a vanity, a kitchen with worktops, a dining table, a living room with a sofa, an armchair and a rug. Soft natural light with gentle shadows and warm accent lighting. Add three or four people seen from above, to scale and naturally placed. Walls cut and shown in solid black. No text, no labels, no dimensions, no room names.',
  },
  eclate: {
    label: { fr: 'Axonométrie éclatée', en: 'Exploded axonometric' },
    reapplyOnEdit: false,
    promptModifier:
      'Turn the building in the attached image into a highly detailed exploded axonometric 3D illustration: a realistic 3D model, not a flat drawing, seen from a high 30-degree angle on a clean white background. Pull the building apart vertically into its construction layers, stacked one above another with even gaps and thin dashed alignment lines between them, from bottom to top: foundations and ground slab, structural frame (columns and beams), each floor slab with its interior walls, stairs and furniture, insulation, facade cladding, windows and glazing, roof structure, roof covering. Keep the building’s real shape, proportions, materials and colours, rendered realistically with soft shadows and ambient occlusion. Add clean architectural labels: thin black leader lines from each layer to a short uppercase label in a clean sans-serif font, aligned in a neat column on the right (for example ROOF, ROOF STRUCTURE, GLAZING, CLADDING, INSULATION, FIRST FLOOR, GROUND FLOOR, STRUCTURAL FRAME, FOUNDATIONS). Every label crisp, legible and spelled correctly, each word written once. High-end technical cutaway illustration style.',
  },
  analyse: {
    label: { fr: 'Planche d’analyse', en: 'Concept board' },
    reapplyOnEdit: false,
    promptModifier:
      'Create an architecture concept analysis board of the building in the attached image, on a clean white background, in the style of an international architecture competition presentation. Precise grid layout with generous white space: a bold title CONCEPT ANALYSIS with the project’s name under it; a large realistic 3D view of the building; its characteristic floor plan in fine black linework labelled FLOOR PLAN, with a north arrow and a scale bar; a long section through the building and the ground labelled SECTION; a row of five small white 3D massing models showing step by step how the form evolved, each numbered with a one-word caption; a strip of five square samples of the building’s real materials, each with a small label. Thin hairline dividers and a few small annotations with arrows. All text crisp, legible and spelled correctly in a clean sans-serif font. Muted palette: white, light grey, concrete, warm wood, one soft accent colour. Professional, print-ready.',
  },
  isometrie: {
    label: { fr: 'Maquette isométrique', en: 'Isometric model' },
    reapplyOnEdit: false,
    promptModifier:
      'Turn the project in the attached image into a clean isometric 3D architectural model, seen from a high 30-degree isometric angle on a very light grey ground crossed by subtle dotted halftone bands. Keep the building’s real volumes, layout, stairs and terraces. Render it like a high-end physical competition model: light birch and pine timber for the structure and slats, smooth pale grey concrete for plinths, walkways and stairs, frosted white glass for roofs and glazing, crisp edges. About fifteen tiny white abstract human figures walking and standing, to scale. Soft even daylight from the top left, gentle ambient occlusion and soft shadows. Muted palette of warm wood, white and light grey only. No trees, no background scenery, no text.',
  },
  // The picture on the menu (public/presets/thumb/esquisse.webp) is a white
  // axonometric diagram with labelled arrows; since 2026-10-10 the modifier
  // asks for exactly that (owner: the ambiance must make the image it shows).
  // It was a loose pencil sketch before.
  esquisse: {
    label: { fr: 'Esquisse', en: 'Sketch' },
    reapplyOnEdit: true,
    promptModifier:
      'Render the building in the attached image as a clean architectural presentation diagram: an all-white matte 3D massing model seen from a high axonometric angle, crisp edges, soft ambient-occlusion shadows, on a very light grey ground. Keep the building’s real shape, openings, terraces and roof. Show the site in the same white and light grey: the street, the plot, a few simple trees and tiny white human figures to scale. Add thin black arrows with short labels in a clean sans-serif font pointing to the entrances and the main outdoor spaces (for example MAIN ENTRANCE, CAR ENTRANCE, BACK YARD, ROOF GARDEN), and STREET ACCESS written along the street. No photorealistic materials or textures, no colours except a touch of warm wood or terracotta on the ground floor. Every label crisp, legible and spelled correctly.',
  },
  jour_ext: {
    label: { fr: 'Jour extérieur', en: 'Exterior day' },
    reapplyOnEdit: true,
    promptModifier:
      'Render in full daylight: natural sunlight, crisp cast shadows, clear sky, exterior viewpoint.',
  },
  jour_int: {
    label: { fr: 'Jour intérieur', en: 'Interior day' },
    reapplyOnEdit: true,
    promptModifier:
      'Render an interior viewpoint lit by natural daylight through the windows, soft ambient fill, no artificial lighting.',
  },
  nuit_ext: {
    label: { fr: 'Nuit extérieur', en: 'Exterior night' },
    reapplyOnEdit: true,
    promptModifier:
      'Render at night, exterior viewpoint: controlled architectural lighting (facade spotlights, warm window glow), dark sky, no direct sunlight.',
  },
  nuit_int: {
    label: { fr: 'Nuit intérieur', en: 'Interior night' },
    reapplyOnEdit: true,
    promptModifier:
      'Render an interior viewpoint at night: warm artificial lighting (ceiling fixtures, lamps), dark windows, no daylight.',
  },
};

/**
 * Sent when the user picked no ambiance and no template: a faithful photo
 * render of their image. From the "render from any 3D software" prompt the
 * owner pointed at (aifordesigners.online, 2026-10-10): the geometry is
 * already right, the engine adds light and texture, not opinions.
 */
export const PHOTO_RENDER_MODIFIER =
  'Create a photorealistic architectural photograph of the attached image. Keep the exact point of view and the exact proportions. Do not alter the building shape, the openings, the architectural details or the materials shown; match every material exactly. Natural, believable light and real-world textures.';

export function isPresetKey(value: string): value is PresetKey {
  return (PRESET_KEYS as readonly string[]).includes(value);
}
