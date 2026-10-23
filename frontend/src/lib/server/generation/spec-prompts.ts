// The prompts of the fourteen ambiances and of Améliorer, from the owner's
// « Spécification des prompts et du pipeline d'analyse » (2026-10-21) — but
// WITHOUT the Claude analysis (2026-10-23, owner: « il n'y aura plus
// d'analyse », then option 3: keep the specification's texts). The locked
// blocks (Transform, Base Design Consistency, Camera, Render Specs, Negative
// Prompts and the fixed texts of ambiances 7 to 14) are the specification's,
// word for word; what Claude used to fill is written here by the code:
// - {lock_summary}: left out — the consistency block already locks the form;
// - {materials}: the image's recorded materials and a pasted sheet's lines,
//   else « every material exactly as shown in the reference image »;
// - {site} / {lighting} / {vegetation} (or {space} / {lighting} / {styling}):
//   the specification's defaults and its example sections (Africa, Abidjan,
//   the default flora), the vegetation already visible kept;
// - labels, access points, floors, roof, a plan's rooms: read from the image
//   by the engine itself, with the specification's rules (only what exists,
//   French, spelled correctly, nothing invented);
// - Améliorer's finishes: the specification's premium finish guide, applied
//   by the engine element by element.
// The user's own words come as a request after the defaults: they replace the
// time, weather, mood, place or plants, never the geometry or the materials.
// The same text goes to Visio and Pixel IA, with the source image.
import 'server-only';
import type { PresetKey, WrittenPreset } from './presets';
import { toPromptLine, profileLight, type SheetRequest } from './render-profiles';
import type { SkyOption } from './templates';
import {
  ENHANCE_OPTION_KEYS,
  type EnhanceAmbianceKey,
  type EnhanceOptionKey,
  type EnhanceStrength,
} from './enhance';
import { DARK_ROOM_LINE, ENHANCE_LINES, STRENGTH_LINES } from './enhance-prompt';

// ── Placeholders ────────────────────────────────────────────────────────────

/** {materials}: « element: material » and « colour → material », separated
 *  by semicolons; each value on one line, so nothing typed starts a line. */
export function materialsText(
  materials: readonly { face: string; valeur: string }[],
  sheet?: SheetRequest | undefined,
): string {
  const recorded = materials
    .map((m) => ({ face: toPromptLine(m.face), valeur: toPromptLine(m.valeur) }))
    .filter((m) => m.face !== '' && m.valeur !== '')
    .map((m) => `${m.face}: ${m.valeur}`);
  const pasted = (sheet?.lines ?? [])
    .map((l) => ({ color: toPromptLine(l.color), material: toPromptLine(l.material) }))
    .filter((l) => l.color !== '' && l.material !== '')
    .map((l) => `where the image shows ${l.color}: ${l.material}`);
  const all = [...recorded, ...pasted];
  return all.length > 0 ? all.join('; ') : 'every material exactly as shown in the reference image';
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

/** Ambiances 1 to 6: the user's words replace the defaults they name. */
function userSettings(text: string): string[] {
  return text
    ? [
        '',
        'USER SETTINGS:',
        `${text}. Where these words differ from the sections above (time, weather, mood, place, plants, accessories), they replace them. They never change the geometry, the openings or the materials.`,
      ]
    : [];
}

// ── Locked blocks (specification, word for word) ────────────────────────────

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
const LIGHT_KEEPS_COLORS =
  'Light affects brightness and tone only; the materials keep their identified colors.';
const RAIN_LINE =
  'Drizzle is fine and subtle, never a downpour hiding the building. The wet look applies to ground and horizontal surfaces only; the facade stays clearly recognizable.';
const NIGHT_VEGETATION = 'Vegetation is softly lit by the exterior lights, colors muted.';
const NIGHT_FIXTURES =
  'Light comes only from fixtures visible in the image; do not add or move fixtures.';

// ── Sections written by the code (specification defaults and examples) ─────

const SITE =
  'Abidjan, Côte d’Ivoire. A quiet residential street: tarred road with red laterite verges, low rendered boundary walls, mature eucalyptus trees, and simple neighbouring buildings set back behind gates, lower in detail, never hiding or competing with the building. If the building is tall or high-rise, it sits inside a dense mid-rise city fabric along an avenue with street life, never floating. Humid tropical calm.';
const NIGHT_NEIGHBOURS = 'The neighbours show only a few distant warm lights.';

const VEGETATION =
  'Keep every plant already visible in the image as it is; add the following only where the image shows no vegetation. A tall eucalyptus with a slender pale trunk and airy canopy rises beside the plot; a broad round-crowned shade tree stands at the far edge. Mid layer: dense rounded ligustrum shrubs, a tropical leafy shrub with palm-like fronds and mounds of red, white and pink flowering shrubs. Ground: clipped low hedge, feathery ornamental grasses, ferns, short lawn. No banana plants, bougainvillea, frangipani, hibiscus, mango trees or royal palms.';

const LIGHTING: Record<WrittenPreset, string> = {
  jour_ext:
    'Late-morning sun around 10 to 11 am, high and slightly angled, casting short crisp shadows from the roof overhang and tree canopies onto the facade. Clear blue sky with a few well-defined white clouds, dry-season clarity, bright and clean mood.',
  heure_doree:
    'Late-afternoon golden hour, low sun raking across the facade from the side, long soft shadows from the eucalyptus and roof overhang, warm amber glow on the materials, clear sky fading from pale gold to soft blue, subtle haze. Calm, warm mood.',
  pluie:
    'Daytime under a heavy overcast sky, soft diffused light with no hard shadows, light drizzle, wet laterite and paving reflecting the facade, damp surfaces slightly darker, saturated greens, thin mist between the trees. Calm, quiet mood.',
  nuit_ext:
    'Blue-hour dusk deepening to night, dark clear sky with faint last light on the horizon. Warm interior light glows through the glazing, soft exterior wall lights and path lights create pools of light on the ground, gentle reflections on glass. Welcoming mood.',
  jour_int:
    'Morning light enters softly through the openings, creating gentle sunbeams across the floor. No artificial light needed; soft shadows, warm neutral tones, calm and restful mood.',
  nuit_int:
    'Evening interior lit only by warm artificial light from the fixtures visible in the image, creating soft pools of light and gentle shadows. Windows show the dark night with a few faint garden lights. Intimate, cozy mood.',
};

/** Exterior day's sky chip (D2, kept): « Voilé », the default, softens it. */
const HAZY_DAY_LIGHTING =
  'Late-morning sun around 10 to 11 am, high and slightly angled, softened by a light haze, casting short soft-edged shadows from the roof overhang and tree canopies onto the facade. Blue sky with a few soft clouds and a light haze, dry season, bright and clean mood.';

const SPACE =
  'A room of a contemporary home in Abidjan, Côte d’Ivoire, with the proportions and layout shown in the image. Any window frames a soft garden view slightly out of focus: eucalyptus trees and rounded shrubs.';
const STYLING =
  'Furniture stays exactly as in the image. Accessories: a few small objects in keeping with the room, such as a handwoven throw or a ceramic vase. Greenery: potted ferns and a leafy plant with palm-like fronds.';

// ── Ambiances 1 to 6 ────────────────────────────────────────────────────────

interface Common {
  materials: readonly { face: string; valeur: string }[];
  sheet?: SheetRequest | undefined;
  /** The user's own words (their version of the bar's text, their request). */
  request: string;
}

function exteriorPrompt(
  preset: Extract<WrittenPreset, 'jour_ext' | 'heure_doree' | 'pluie' | 'nuit_ext'>,
  sky: SkyOption,
  c: Common,
): string {
  const night = preset === 'nuit_ext';
  const lighting = preset === 'jour_ext' && sky !== 'sun' ? HAZY_DAY_LIGHTING : LIGHTING[preset];
  return [
    'TRANSFORM:',
    EXTERIOR.transform,
    '',
    'BASE DESIGN CONSISTENCY:',
    EXTERIOR.consistency,
    '',
    'SITE LOCATION & NEIGHBOURHOOD CONTEXT:',
    night ? `${SITE} ${NIGHT_NEIGHBOURS}` : SITE,
    '',
    'MATERIALS & TEXTURE:',
    `Finishes: ${materialsText(c.materials, c.sheet)}. ${KEEP_MATERIALS}`,
    night ? EXTERIOR.nightGlazing : EXTERIOR.glazing,
    EXTERIOR.surfaces,
    '',
    'LIGHTING & MOOD:',
    lighting,
    ...(preset === 'jour_ext' ? [] : [LIGHT_KEEPS_COLORS]),
    ...(preset === 'pluie' ? [RAIN_LINE] : []),
    '',
    'VEGETATION:',
    VEGETATION,
    EXTERIOR.plants,
    ...(night ? [NIGHT_VEGETATION] : []),
    'Fauna: none',
    ...userSettings(c.request),
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

function interiorPrompt(
  preset: Extract<WrittenPreset, 'jour_int' | 'nuit_int'>,
  c: Common,
): string {
  return [
    'TRANSFORM:',
    INTERIOR.transform,
    '',
    'BASE DESIGN CONSISTENCY:',
    INTERIOR.consistency,
    '',
    'SPACE & CONTEXT:',
    SPACE,
    '',
    'MATERIALS & TEXTURE:',
    `Finishes: ${materialsText(c.materials, c.sheet)}. ${KEEP_MATERIALS}`,
    INTERIOR.fabrics,
    INTERIOR.surfaces,
    '',
    'LIGHTING & MOOD:',
    LIGHTING[preset],
    LIGHT_KEEPS_COLORS,
    ...(preset === 'nuit_int' ? [NIGHT_FIXTURES] : []),
    '',
    'STYLING & PROPS:',
    STYLING,
    INTERIOR.furniture,
    ...userSettings(c.request),
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

function planPrompt(c: Common): string {
  const m = materialsText(c.materials, c.sheet);
  const recorded = m.startsWith('every material') ? [] : [`Recorded materials: ${m}.`];
  return [
    'Render this floor plan as a realistic top-down 3D view, roof removed, walls cut to show their thickness.',
    'Use the uploaded plan image as the exact layout — keep every wall, room, opening and proportion identical, do not redesign the plan.',
    'Read each room name exactly as written on the plan; if none is written, name the room by its function, in French. Show an area only if it is written on the plan; never compute one. Where the plan gives no materials: living and dining: large-format light tiles or polished concrete; bedrooms: iroko wood; kitchen and wet rooms: ceramic tiles; terrace: stone paving.',
    ...recorded,
    '',
    'Show each room name exactly as on the plan, spelled correctly, with its area only if the plan gives one. Keep the title block and graphic scale if present on the plan.',
    "Furniture: only the essential furniture of each room's function. Do not add extra furniture, appliances, TVs or any element the room does not need.",
    'Style: contemporary, warm natural materials, soft daylight from above, soft realistic shadows under furniture, clean color palette so each room is readable at a glance.',
    'Outdoors: short lawn, clipped low hedge, mounds of flowering shrubs in red, white and pink, ferns, one eucalyptus.',
    'Photorealistic, high detail.',
    ...requestLine(c.request),
    '',
    'NEGATIVE: no redesign of the plan, no moved walls, no added rooms, no cartoon style, no spelling errors in labels.',
  ].join('\n');
}

function explodedPrompt(c: Common): string {
  return [
    'Transform this image into an exploded axonometric diagram of the building. Separate the building vertically into its main layers (roof, each floor level, ground floor, slab), floating apart with equal spacing, all aligned on the same vertical axis. Viewed from a corner, rotated 45 degrees.',
    'Keep the exact geometry, proportions and openings of each layer as in the reference image: do not redesign anything.',
    `Materials as identified: ${materialsText(c.materials, c.sheet)}. Same type, same color, same placement; only enhance realism.`,
    'Pure white background, soft shadows, thin leader lines with short labels in French (max 3 words each, for example Toiture, Étage, Rez-de-chaussée, Dalle), spelled correctly. Label only layers and materials that exist in the image.',
    'Clean technical presentation style. No people, no vegetation.',
    ...requestLine(c.request),
    '',
    'NEGATIVE: no redesign, no added or removed windows, no change to materials, no cartoon style, no spelling errors in labels.',
  ].join('\n');
}

/** Ambiances 9 to 11: the Excel's « Render Styles » master prompt. */
function stylePrompt(
  style: { style: string; traits: string; rules: string; negative: string },
  request: string,
): string {
  return [
    `Restyle this image as ${style.style}. Keep the exact composition, geometry, perspective, proportions, and all architectural elements identical to the original — do not redesign or move anything. Preserve the people and their activity if present. Apply: ${style.traits}.`,
    style.rules,
    ...requestLine(request),
    `NEGATIVE: no redesign, no added or removed windows, ${style.negative}.`,
  ].join('\n');
}

function whiteModelPrompt(c: Common): string {
  return stylePrompt(
    {
      style:
        'a white architectural clay model, photographed on a plain light base in soft studio light',
      traits:
        'single uniform off-white clay material on every surface, soft global illumination, ambient occlusion in the crevices, no textures, no colour, pure form study, gentle soft shadows',
      rules: `Elements stay distinguishable by shape and shadow only, never by colour: ${materialsText(c.materials, c.sheet)} become plain white volumes with the same placement. Openings are shallow recesses, not transparent glass. Vegetation, if any, as simple white clay volumes that never cover the building. People, if present, as white figures.`,
      negative: 'no colour, no textures, no photorealistic materials',
    },
    c.request,
  );
}

function sketchPrompt(c: Common): string {
  return stylePrompt(
    {
      style: 'a graphite sketch',
      traits:
        'soft hand-drawn pencil shading, hatching and smudging, monochrome grey, visible construction lines, on white paper',
      rules: `Materials are suggested by hatching patterns, never by colour: ${materialsText(c.materials, c.sheet)}, each keeping its placement. Linework stays accurate to the geometry. Vegetation drawn loosely in pencil (eucalyptus, rounded shrubs, grasses), around the building and never covering it.`,
      negative: 'no colour, no photorealism',
    },
    c.request,
  );
}

function watercolourPrompt(c: Common): string {
  return stylePrompt(
    {
      style: 'a watercolor illustration',
      traits:
        'translucent washes, soft bleeding edges, visible paper grain, white paper left in the highlights, faint pencil underdrawing, loose hand-painted imperfection',
      rules: `Washes follow the identified materials and keep their colors and placement: ${materialsText(c.materials, c.sheet)}. Linework and volumes stay accurate to the geometry. Sky as a loose pale wash. Vegetation painted with the default plant types (eucalyptus, rounded shrubs, mounds of flowering shrubs in red, white and pink, ferns, grasses), around the building and never covering it.`,
      negative: 'no photorealism, no change of material colors',
    },
    c.request,
  );
}

function isometricPrompt(c: Common): string {
  return [
    'Transform this image into an isometric architectural presentation view of the building, seen from above at 45 degrees, parallel projection with no perspective distortion, on a plain light grey background.',
    'Keep the exact geometry, proportions and openings as in the reference image: do not redesign anything.',
    `Materials as identified: ${materialsText(c.materials, c.sheet)}. Same type, same color, same placement; only enhance realism with a clean model-like finish.`,
    'Soft studio light, soft shadows on the ground plane, a thin base under the building showing the plot only. Minimal vegetation: one eucalyptus and a few rounded shrubs, small and simple, never covering the building. No neighbours, no people, no text.',
    ...requestLine(c.request),
    '',
    'NEGATIVE: no redesign, no added or removed windows, no change to materials, no perspective distortion, no cartoon style.',
  ].join('\n');
}

function accessPrompt(c: Common): string {
  return [
    'Transform this image into an access diagram: an isometric view of the building as a plain white massing model on a light grey background, seen from above at 45 degrees.',
    'Keep the exact geometry, proportions and openings as in the reference image: do not redesign anything.',
    'All surfaces in white and light grey only, openings as thin dark lines.',
    'Add thin dark arrows showing how people enter, with short uppercase labels in French (max 3 words each, for example ENTRÉE PRINCIPALE, GARAGE), spelled correctly. Label only the entrances and access points visible in the image; do not invent entrances, streets or paths.',
    'Clean diagram style: thin leader lines, small uppercase sans-serif text, no people, no vegetation, no color.',
    ...requestLine(c.request),
    '',
    'NEGATIVE: no redesign, no added or removed windows, no invented streets or paths, no color, no spelling errors in labels.',
  ].join('\n');
}

function boardPrompt(c: Common): string {
  return [
    'Create an architectural analysis board in landscape format, on a clean white background, in a minimal editorial layout, from this image.',
    'Panels:',
    '1. VUE PRINCIPALE: the uploaded image, kept identical, large, about half of the board.',
    '2. VOLUMÉTRIE: the same building as a simplified white massing diagram, same geometry.',
    '3. COUPE SCHÉMATIQUE: a simple schematic section line drawing showing the levels and the roof type visible in the image. No interior details invented.',
    `4. MATÉRIAUX: swatches of the identified materials with their exact colors: ${materialsText(c.materials, c.sheet)}.`,
    'Short panel titles in French, small uppercase text, spelled correctly. Thin light grey lines, balanced spacing, no people, no extra text.',
    'Keep the geometry exactly as in the reference. Do not invent rooms, plans or dimensions.',
    ...requestLine(c.request),
    '',
    'NEGATIVE: no redesign, no invented plans or dimensions, no change to materials, no spelling errors in labels.',
  ].join('\n');
}

/** The prompt of a render with an ambiance (the menu's fourteen, the fan's
 *  templates). */
export function ambiancePrompt(input: {
  preset: PresetKey;
  sky?: SkyOption | undefined;
  materials: readonly { face: string; valeur: string }[];
  sheet?: SheetRequest | undefined;
  /** The user's own words, already joined (userText). */
  request: string;
}): string {
  const c: Common = { materials: input.materials, sheet: input.sheet, request: input.request };
  switch (input.preset) {
    case 'jour_ext':
    case 'heure_doree':
    case 'pluie':
    case 'nuit_ext':
      return exteriorPrompt(input.preset, input.sky ?? 'hazy', c);
    case 'jour_int':
    case 'nuit_int':
      return interiorPrompt(input.preset, c);
    case 'plan_3d':
      return planPrompt(c);
    case 'eclate':
      return explodedPrompt(c);
    case 'maquette_blanche':
      return whiteModelPrompt(c);
    case 'croquis':
      return sketchPrompt(c);
    case 'aquarelle':
      return watercolourPrompt(c);
    case 'isometrie':
      return isometricPrompt(c);
    case 'esquisse':
      return accessPrompt(c);
    case 'analyse':
      return boardPrompt(c);
  }
}

// ── Améliorer ───────────────────────────────────────────────────────────────

/** The specification's premium finish guide (same class, same colour family). */
export const PREMIUM_FINISH_GUIDE =
  'render or wall paint → lime-based render, fine grain with subtle trowel marks, matte; concrete → architectural board-formed concrete, fine formwork lines, tiny natural pores, even tone; wood cladding or slats → clear-oiled timber slats with visible grain and tight even joints, in the original wood tone; brick → fired brick, fine mortar joints, slight natural tone variation between bricks; stone → dressed natural stone, honed face, tight joints, fine natural pores; tiles and hard floors → large-format porcelain tile, thin joints, soft sheen; parquet → wide-plank wood flooring, visible grain, satin oil finish; aluminium joinery → slim matte powder-coated aluminium profiles, crisp edges; glass → clear low-iron glass, accurate reflections of sky and surroundings, subtle edge tint; metal (railings, roofing) → brushed metal with fine linear grain, soft reflections; exterior ground → stone pavers with fine joints, subtle natural wear; lawn and plants → dense healthy turf with natural variation, plants with detailed leaf texture, same plant types as in the image; textile → true fiber depth, visible weave, natural drape, subtle sheen';

/** The improvements of the page that change the light: ticked, the image's
 *  own light is no longer locked (the user's choice comes first). */
const LIGHT_OPTIONS: readonly EnhanceOptionKey[] = ['lighting', 'sky', 'ambiance'];

/** Neither exterior nor interior is known without an analysis: the render
 *  specs name both kinds of photograph. */
const ENHANCE_SPECS =
  'Ultra-photorealistic, 8K print quality, full dynamic range with rich detail in both deep shadows and bright highlights, color science warm, natural and cinematic with subtle richness without oversaturation, output must feel like a professional architectural or interior photograph shot for a premium magazine like Architectural Digest.';

export function enhancePrompt(input: {
  options: readonly EnhanceOptionKey[];
  strength: EnhanceStrength;
  darkRoom?: boolean | undefined;
  ambiance?: EnhanceAmbianceKey | undefined;
  instruction?: string | undefined;
}): string {
  const picked = ENHANCE_OPTION_KEYS.filter((k) => input.options.includes(k));
  const changesLight = picked.some((k) => LIGHT_OPTIONS.includes(k));

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

  return [
    `Improve the material quality and realism of this image. Keep the exact composition, geometry, perspective, proportions, camera${changesLight ? '' : ', lighting'} and all elements identical — do not redesign, move, add or remove anything.`,
    `Upgrade only the surface quality, element by element, each on its exact element and placement: identify the material of each visible element and apply the premium finish of the same material from this guide: ${PREMIUM_FINISH_GUIDE}. If a material cannot be identified with confidence, keep it as is.`,
    'Each upgrade keeps the material type and the color family of the original and only adds premium detail: true grain, fine joints, subtle sheen, correct reflections, natural micro-variation. Elements not listed stay untouched.',
    'Increase overall sharpness and micro-detail without halos or oversharpening. Preserve people, plants, furniture and context exactly as in the image.',
    'RENDER SPECS:',
    ENHANCE_SPECS,
    '',
    'USER REQUEST:',
    ...asked,
    '',
    `NEGATIVE: no redesign, no new or removed elements, no change of material type or color family, no plastic look, no oversharpening halos${changesLight ? '' : ', no change of lighting or weather'}.`,
  ].join('\n');
}
