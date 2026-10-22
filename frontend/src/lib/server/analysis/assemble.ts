// The final prompt an engine receives (2026-10-22 specification, phase 4):
// the locked blocks — Transform, Base Design Consistency, Camera, Render
// Specs, Negative Prompts and the fixed texts of ambiances 7 to 14 — are
// written here, word for word from the specification, and never by Claude;
// only the placeholders are filled from the analysis and the written
// sections. The same text goes to Visio and Pixel IA, with the source image.
import 'server-only';
import { toPromptLine } from '@/lib/server/generation/render-profiles';
import type { PresetKey, WrittenPreset } from '@/lib/server/generation/presets';
import {
  ENHANCE_LINES,
  DARK_ROOM_LINE,
  STRENGTH_LINES,
} from '@/lib/server/generation/enhance-prompt';
import { profileLight } from '@/lib/server/generation/render-profiles';
import {
  ENHANCE_OPTION_KEYS,
  type EnhanceAmbianceKey,
  type EnhanceOptionKey,
  type EnhanceStrength,
} from '@/lib/server/generation/enhance';
import type { BuildingAnalysis, EnhanceAnalysis, PlanAnalysis } from './analyze';
import type { Sections } from './writer';
import { withoutBookkeeping } from './sheets';

// ── Placeholders ────────────────────────────────────────────────────────────

/** {materials}: « element: material (color) » separated by semicolons. */
export function materialsText(materials: BuildingAnalysis['materials']): string {
  return materials
    .map((m) => `${m.element}: ${m.material}${m.color ? ` (${m.color})` : ''}`)
    .join('; ');
}

/** The user's own words as one line, or ''. */
export function userText(...parts: (string | undefined)[]): string {
  return parts
    .map((p) => (p ? toPromptLine(p) : ''))
    .filter(Boolean)
    .join(' ');
}

/** Ambiances 7 to 14 have fixed texts: the user's words come as a request
 *  that never lifts a lock. */
function requestLine(text: string): string[] {
  return text
    ? [`User request: ${text}. It never changes the geometry, the openings or the materials above.`]
    : [];
}

// ── Locked blocks ───────────────────────────────────────────────────────────

const EXTERIOR = {
  transform:
    'This render image into an ultra-photorealistic architectural photograph, 8K, DSLR photo shot on location as if captured on Sony VENICE 2, Zeiss Otus 28mm lens.',
  consistency:
    'Do not alter, redesign, or reinterpret the architectural form in any way. Strictly preserve the exact geometry, massing, proportions, window placement, roof profile, and facade composition exactly as shown in the reference image. No reinterpretation of form.',
  glazing:
    'Glazing: clear high performance glass reflecting the sky; interior behind the glass dark and unreadable, no invented interior elements.',
  nightGlazing:
    'Glazing: clear high performance glass; warm light glows behind it, interior kept soft and unreadable, no invented furniture or people.',
  surfaces:
    'All surfaces clean, freshly constructed, well maintained. Subtle natural micro-variations on every surface: slight irregularities in the render, small variations in grass and ground, light wear on paving. Nothing sterile or perfectly uniform.',
  plants:
    'Plants stay around and beside the building and never cover or alter the facade, openings, roof or materials.',
  camera:
    'Photographed on Sony VENICE 2, Zeiss Otus 28mm lens, f/8, eye-level, shot for Architectural Digest, editorial architectural photography',
  specs:
    'Ultra-photorealistic, 8K print quality, full dynamic range with rich detail in both deep shadows and bright highlights, color science warm, natural and cinematic with subtle richness without oversaturation, output must feel like a professional architectural photograph shot for a premium magazine like Architectural Digest.',
  negative:
    'No redesigning of architecture or facade, no cartoon style, no plastic-looking materials or CGI surfaces, no excessive glow, bloom, or vignette. No changes to materials, no added or removed windows, no change to the building shape.',
} as const;

const INTERIOR = {
  transform:
    'This SketchUp viewport image into an ultra-photorealistic interior photograph, 8K, DSLR photo shot on interior space as if captured on Sony VENICE 2, Zeiss Otus 35mm lens.',
  consistency:
    'Do not redesign, or reinterpret the interior spatial composition in any way. Strictly preserve the exact ceiling height, wall positions, door and window placement, built-in joinery, and furniture arrangement exactly as shown in the reference image. No creative additions, no furniture substitutions, no reinterpretation of space.',
  fabrics:
    'All fabrics rendered with true fiber depth — thread weave visible, natural drape and weight, correct light absorption and subtle sheen specific to each material.',
  surfaces:
    'Subtle natural micro-variations on every surface: slight wood grain variation, gentle fabric creasing, soft wear on floors. Nothing sterile or perfectly uniform.',
  furniture:
    'Furniture stays exactly as in the image. Styling adds only small accessories and plants; do not add, remove or replace furniture.',
  camera:
    'Photographed on Sony VENICE 2, Zeiss Otus 35mm lens, f/8, interior eye-level at 1.0 to 1.2 metres above floor, shot for Architectural Digest, editorial interior photography.',
  specs:
    'Ultra-photorealistic, 8K print quality, full dynamic range with rich detail in both deep shadows and bright highlights, color science warm, natural and cinematic with subtle richness without oversaturation, output must feel like a professional interior photograph shot for a premium magazine like Architectural Digest.',
  negative:
    'No redesigning of interior layout or spatial composition, no furniture substitution, no cartoon style, no plastic-looking materials or CGI surfaces, no excessive glow, bloom, or vignette, no floating objects, no distorted perspective, no unrealistic scale. No changes to materials, no added or removed doors or windows.',
} as const;

const KEEP_MATERIALS =
  'Keep every material exactly as identified: same type, same color, same placement. Only enhance realism: true texture depth, natural micro-variation, correct light response. Do not replace, restyle or invent materials.';
/** Ambiances 2 to 6: the light changes brightness and tone, never a colour. */
const LIGHT_KEEPS_COLORS =
  'Light affects brightness and tone only; the materials keep their identified colors.';
const RAIN_LINE =
  'Drizzle is fine and subtle, never a downpour hiding the building. The wet look applies to ground and horizontal surfaces only; the facade stays clearly recognizable.';
const NIGHT_VEGETATION = 'Vegetation is softly lit by the exterior lights, colors muted.';
const NIGHT_FIXTURES =
  'Light comes only from fixtures visible in the image; do not add or move fixtures.';

const geometry = (a: { lock_summary: string }) => `Geometry to preserve: ${a.lock_summary}.`;

// ── Ambiances 1 to 6 ────────────────────────────────────────────────────────

export function exteriorPrompt(
  preset: Extract<WrittenPreset, 'jour_ext' | 'heure_doree' | 'pluie' | 'nuit_ext'>,
  analysis: BuildingAnalysis,
  s: Sections,
): string {
  const night = preset === 'nuit_ext';
  return [
    'TRANSFORM:',
    EXTERIOR.transform,
    '',
    'BASE DESIGN CONSISTENCY:',
    `${EXTERIOR.consistency} ${geometry(analysis)}`,
    '',
    'SITE LOCATION & NEIGHBOURHOOD CONTEXT:',
    s.site,
    '',
    'MATERIALS & TEXTURE:',
    `Finishes: ${materialsText(analysis.materials)}. ${KEEP_MATERIALS}`,
    night ? EXTERIOR.nightGlazing : EXTERIOR.glazing,
    EXTERIOR.surfaces,
    '',
    'LIGHTING & MOOD:',
    s.lighting,
    ...(preset === 'jour_ext' ? [] : [LIGHT_KEEPS_COLORS]),
    ...(preset === 'pluie' ? [RAIN_LINE] : []),
    '',
    'VEGETATION:',
    s.vegetation,
    EXTERIOR.plants,
    ...(night ? [NIGHT_VEGETATION] : []),
    'Fauna: none',
    '',
    'CAMERA:',
    EXTERIOR.camera,
    '',
    'RENDER SPECS:',
    EXTERIOR.specs,
    '',
    'NEGATIVE PROMPTS:',
    EXTERIOR.negative,
  ].join('\n');
}

export function interiorPrompt(
  preset: Extract<WrittenPreset, 'jour_int' | 'nuit_int'>,
  analysis: BuildingAnalysis,
  s: Sections,
): string {
  return [
    'TRANSFORM:',
    INTERIOR.transform,
    '',
    'BASE DESIGN CONSISTENCY:',
    `${INTERIOR.consistency} ${geometry(analysis)}`,
    '',
    'SPACE & CONTEXT:',
    s.space,
    '',
    'MATERIALS & TEXTURE:',
    `Finishes: ${materialsText(analysis.materials)}. ${KEEP_MATERIALS}`,
    INTERIOR.fabrics,
    INTERIOR.surfaces,
    '',
    'LIGHTING & MOOD:',
    s.lighting,
    LIGHT_KEEPS_COLORS,
    ...(preset === 'nuit_int' ? [NIGHT_FIXTURES] : []),
    '',
    'STYLING & PROPS:',
    s.styling,
    INTERIOR.furniture,
    '',
    'CAMERA:',
    INTERIOR.camera,
    '',
    'RENDER SPECS:',
    INTERIOR.specs,
    '',
    'NEGATIVE PROMPTS:',
    INTERIOR.negative,
  ].join('\n');
}

// ── Ambiances 7 to 14 ───────────────────────────────────────────────────────

/** {analysis_json}: the plan's spec, without the bookkeeping fields. */
function planSpec(analysis: PlanAnalysis): string {
  return JSON.stringify(withoutBookkeeping(analysis));
}

export function planPrompt(analysis: PlanAnalysis, request: string): string {
  return [
    'Render this floor plan as a realistic top-down 3D view, roof removed, walls cut to show their thickness.',
    'Use the uploaded plan image as the exact layout — keep every wall, room, opening and proportion identical, do not redesign the plan.',
    `Apply the materials, furniture and style from this spec: ${planSpec(analysis)}`,
    '',
    'Show each room name exactly as in the spec, spelled correctly, with its area only if the spec gives one. Keep the title block and graphic scale if present on the plan.',
    'Furniture: only the items listed in key_furniture for each room. Do not add furniture, appliances, TVs or any element that is not in the spec.',
    'Style: contemporary, warm natural materials, soft daylight from above, soft realistic shadows under furniture, clean color palette so each room is readable at a glance.',
    'Outdoors: short lawn, clipped low hedge, mounds of flowering shrubs in red, white and pink, ferns, one eucalyptus.',
    'Photorealistic, high detail.',
    ...requestLine(request),
    '',
    'NEGATIVE: no redesign of the plan, no moved walls, no added rooms, no cartoon style, no spelling errors in labels.',
  ].join('\n');
}

export function explodedPrompt(analysis: BuildingAnalysis, request: string): string {
  const labels = (analysis.labels_fr ?? []).filter(Boolean).join(', ');
  return [
    'Transform this image into an exploded axonometric diagram of the building. Separate the building vertically into its main layers (roof, each floor level, ground floor, slab), floating apart with equal spacing, all aligned on the same vertical axis. Viewed from a corner, rotated 45 degrees.',
    `Keep the exact geometry, proportions and openings of each layer as in the reference image: do not redesign anything. ${geometry(analysis)}`,
    `Materials as identified: ${materialsText(analysis.materials)}. Same type, same color, same placement; only enhance realism.`,
    `Pure white background, soft shadows, thin leader lines with short labels in French, spelled correctly: ${labels}. Label only layers and materials that exist in the analysis.`,
    'Clean technical presentation style. No people, no vegetation.',
    ...requestLine(request),
    '',
    'NEGATIVE: no redesign, no added or removed windows, no change to materials, no cartoon style, no spelling errors in labels.',
  ].join('\n');
}

/** Ambiances 9 to 11: the Excel's « Render Styles » master prompt. */
function stylePrompt(
  analysis: BuildingAnalysis,
  style: { style: string; traits: string; rules: string; negative: string },
  request: string,
): string {
  return [
    `Restyle this image as ${style.style}. Keep the exact composition, geometry, perspective, proportions, and all architectural elements identical to the original — do not redesign or move anything. ${geometry(analysis)} Preserve the people and their activity if present. Apply: ${style.traits}.`,
    style.rules,
    ...requestLine(request),
    `NEGATIVE: no redesign, no added or removed windows, ${style.negative}.`,
  ].join('\n');
}

export function whiteModelPrompt(analysis: BuildingAnalysis, request: string): string {
  return stylePrompt(
    analysis,
    {
      style:
        'a white architectural clay model, photographed on a plain light base in soft studio light',
      traits:
        'single uniform off-white clay material on every surface, soft global illumination, ambient occlusion in the crevices, no textures, no colour, pure form study, gentle soft shadows',
      rules: `Elements stay distinguishable by shape and shadow only, never by colour: ${materialsText(analysis.materials)} become plain white volumes with the same placement. Openings are shallow recesses, not transparent glass. Vegetation, if any, as simple white clay volumes that never cover the building. People, if present, as white figures.`,
      negative: 'no colour, no textures, no photorealistic materials',
    },
    request,
  );
}

export function sketchPrompt(analysis: BuildingAnalysis, request: string): string {
  return stylePrompt(
    analysis,
    {
      style: 'a graphite sketch',
      traits:
        'soft hand-drawn pencil shading, hatching and smudging, monochrome grey, visible construction lines, on white paper',
      rules: `Materials are suggested by hatching patterns, never by colour: ${materialsText(analysis.materials)}, each keeping its placement. Linework stays accurate to the geometry. Vegetation drawn loosely in pencil (eucalyptus, rounded shrubs, grasses), around the building and never covering it.`,
      negative: 'no colour, no photorealism',
    },
    request,
  );
}

export function watercolourPrompt(analysis: BuildingAnalysis, request: string): string {
  return stylePrompt(
    analysis,
    {
      style: 'a watercolor illustration',
      traits:
        'translucent washes, soft bleeding edges, visible paper grain, white paper left in the highlights, faint pencil underdrawing, loose hand-painted imperfection',
      rules: `Washes follow the identified materials and keep their colors and placement: ${materialsText(analysis.materials)}. Linework and volumes stay accurate to the geometry. Sky as a loose pale wash. Vegetation painted with the default plant types (eucalyptus, rounded shrubs, mounds of flowering shrubs in red, white and pink, ferns, grasses), around the building and never covering it.`,
      negative: 'no photorealism, no change of material colors',
    },
    request,
  );
}

export function isometricPrompt(analysis: BuildingAnalysis, request: string): string {
  return [
    'Transform this image into an isometric architectural presentation view of the building, seen from above at 45 degrees, parallel projection with no perspective distortion, on a plain light grey background.',
    `Keep the exact geometry, proportions and openings as in the reference image: do not redesign anything. ${geometry(analysis)}`,
    `Materials as identified: ${materialsText(analysis.materials)}. Same type, same color, same placement; only enhance realism with a clean model-like finish.`,
    'Soft studio light, soft shadows on the ground plane, a thin base under the building showing the plot only. Minimal vegetation: one eucalyptus and a few rounded shrubs, small and simple, never covering the building. No neighbours, no people, no text.',
    ...requestLine(request),
    '',
    'NEGATIVE: no redesign, no added or removed windows, no change to materials, no perspective distortion, no cartoon style.',
  ].join('\n');
}

export function accessPrompt(analysis: BuildingAnalysis, request: string): string {
  const labels = (analysis.access_points ?? [])
    .map((a) => (a.location ? `${a.label_fr} (${a.location})` : a.label_fr))
    .join(', ');
  return [
    'Transform this image into an access diagram: an isometric view of the building as a plain white massing model on a light grey background, seen from above at 45 degrees.',
    `Keep the exact geometry, proportions and openings as in the reference image: do not redesign anything. ${geometry(analysis)}`,
    'All surfaces in white and light grey only, openings as thin dark lines.',
    `Add thin dark arrows showing how people enter, with short uppercase labels in French, spelled correctly: ${labels}. Label only the access points listed in the analysis; do not invent entrances, streets or paths.`,
    'Clean diagram style: thin leader lines, small uppercase sans-serif text, no people, no vegetation, no color.',
    ...requestLine(request),
    '',
    'NEGATIVE: no redesign, no added or removed windows, no invented streets or paths, no color, no spelling errors in labels.',
  ].join('\n');
}

export function boardPrompt(analysis: BuildingAnalysis, request: string): string {
  const floors = String(analysis.floors ?? '').trim() || 'the';
  return [
    'Create an architectural analysis board in landscape format, on a clean white background, in a minimal editorial layout, from this image.',
    'Panels:',
    '1. VUE PRINCIPALE: the uploaded image, kept identical, large, about half of the board.',
    '2. VOLUMÉTRIE: the same building as a simplified white massing diagram, same geometry.',
    `3. COUPE SCHÉMATIQUE: a simple schematic section line drawing showing ${floors} levels and the roof type: ${analysis.roof}. No interior details invented.`,
    `4. MATÉRIAUX: swatches of the identified materials with their exact colors: ${materialsText(analysis.materials)}.`,
    'Short panel titles in French, small uppercase text, spelled correctly. Thin light grey lines, balanced spacing, no people, no extra text.',
    `Keep the geometry exactly as in the reference. ${geometry(analysis)} Do not invent rooms, plans or dimensions.`,
    ...requestLine(request),
    '',
    'NEGATIVE: no redesign, no invented plans or dimensions, no change to materials, no spelling errors in labels.',
  ].join('\n');
}

/** Ambiances 8 to 14 from the general analysis. */
export function fixedPrompt(
  preset: Exclude<PresetKey, WrittenPreset | 'plan_3d'>,
  analysis: BuildingAnalysis,
  request: string,
): string {
  switch (preset) {
    case 'eclate':
      return explodedPrompt(analysis, request);
    case 'maquette_blanche':
      return whiteModelPrompt(analysis, request);
    case 'croquis':
      return sketchPrompt(analysis, request);
    case 'aquarelle':
      return watercolourPrompt(analysis, request);
    case 'isometrie':
      return isometricPrompt(analysis, request);
    case 'esquisse':
      return accessPrompt(analysis, request);
    case 'analyse':
      return boardPrompt(analysis, request);
  }
}

// ── Améliorer ───────────────────────────────────────────────────────────────

/** {upgrades}: « element: premium_finish », without « keep as is ». */
export function upgradesText(analysis: EnhanceAnalysis): string {
  return analysis.elements
    .filter((e) => e.premium_finish && !/^keep as is$/i.test(e.premium_finish))
    .map((e) => `${e.element}: ${e.premium_finish}`)
    .join('; ');
}

/** The light-changing improvements of the page: ticked, the image's light is
 *  no longer locked (the user's choice comes first). */
const LIGHT_OPTIONS: readonly EnhanceOptionKey[] = ['lighting', 'sky', 'ambiance'];

function lookRecipe(look: unknown): string {
  const r =
    typeof look === 'object' && look !== null ? (look as { recipe?: unknown }).recipe : null;
  return typeof r === 'string' ? toPromptLine(r) : '';
}

export function enhancePrompt(input: {
  analysis: EnhanceAnalysis;
  options: readonly EnhanceOptionKey[];
  strength: EnhanceStrength;
  darkRoom?: boolean | undefined;
  ambiance?: EnhanceAmbianceKey | undefined;
  instruction?: string | undefined;
}): string {
  const { analysis } = input;
  const picked = ENHANCE_OPTION_KEYS.filter((k) => input.options.includes(k));
  const changesLight = picked.some((k) => LIGHT_OPTIONS.includes(k));
  const upgrades = upgradesText(analysis);
  const specs = analysis.type === 'interior' ? INTERIOR.specs : EXTERIOR.specs;

  // The page's own choices — ticked improvements, intensity, the user's words
  // — come as the user's request, after the specification's prompt.
  const asked: string[] = [];
  for (const k of picked) {
    asked.push(ENHANCE_LINES[k]);
    if (k === 'lighting' && input.darkRoom) asked.push(DARK_ROOM_LINE);
    if (k === 'ambiance' && input.ambiance) {
      asked.push(
        `Lighting guidance of the selected profile: ${profileLight(input.ambiance).visio}`,
      );
    }
  }
  asked.push(STRENGTH_LINES[input.strength]);
  const words = userText(input.instruction);
  if (words) asked.push(`In the user's words: ${words}.`);

  const recipe = changesLight ? '' : lookRecipe(analysis.look);
  return [
    `Improve the material quality and realism of this image. Keep the exact composition, geometry, perspective, proportions, camera${changesLight ? '' : ', lighting'} and all elements identical — do not redesign, move, add or remove anything. ${geometry(analysis)}`,
    ...(upgrades
      ? [
          `Upgrade only the surface quality, element by element, each on its exact element and placement, using these premium finishes: ${upgrades}.`,
        ]
      : []),
    'Each upgrade keeps the material type and the color family of the original and only adds premium detail: true grain, fine joints, subtle sheen, correct reflections, natural micro-variation. Elements not listed stay untouched.',
    'Increase overall sharpness and micro-detail without halos or oversharpening. Preserve people, plants, furniture and context exactly as in the image.',
    ...(recipe ? [`Keep the image's own light, weather and grading: ${recipe}`] : []),
    'RENDER SPECS:',
    specs,
    '',
    'USER REQUEST:',
    ...asked,
    '',
    `NEGATIVE: no redesign, no new or removed elements, no change of material type or color family, no plastic look, no oversharpening halos${changesLight ? '' : ', no change of lighting or weather'}.`,
  ].join('\n');
}
