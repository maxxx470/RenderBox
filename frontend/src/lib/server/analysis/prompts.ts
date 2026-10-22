// The texts Claude reads before a render (2026-10-22, owner: « RenderPro –
// Spécification des prompts et du pipeline d'analyse », which replaces the
// prompts v2 of 2026-10-20). Copied from the specification word for word —
// only the placeholders are filled in by code. Nothing here goes to an image
// engine: the engines' prompts are assembled in assemble.ts.
import 'server-only';

// ── Phase 1 · the analysis (call 1) ─────────────────────────────────────────

/** `{sheets or "none"}`: the project's sheets as JSON, or the word none. */
export function sheetsText(sheets: readonly unknown[]): string {
  return sheets.length > 0 ? JSON.stringify(sheets) : 'none';
}

/** The general analysis (renders, ambiances 1 to 6 and 8 to 14). */
export function analysisPrompt(sheets: string, extraFields: readonly string[] = []): string {
  return [
    'Analyze this architectural image. Output valid JSON only.',
    `Project reference sheets: ${sheets}`,
    '',
    'Rules:',
    '- If the image cannot be read or is not an architectural image, output {"status":"unreadable"} and nothing else.',
    "- If reference sheets are provided, decide if this image shows the same building as one of them (same_building: yes|no|unsure, matched_sheet: its id or null). If yes, keep that sheet's element names, material wording, colors and placement for every element that is recognizably the same, and only add what is newly visible (e.g. another facade). Where an element is clearly a different material, describe what the image shows and list it in changes_vs_sheet. If no or unsure, ignore the sheets.",
    '- Describe only what is visible. Do not invent anything.',
    '- materials: one entry per visible element (ground floor walls, upper floor cladding, window frames, roof, paving, boundary wall...), with the material in plain words and its color.',
    '',
    'Fields: status ("ok"), same_building, matched_sheet, type (exterior|interior), building_type, floors, roof, openings (count and layout), materials [{element, material, color}], view_angle, lock_summary (one sentence, max 40 words: proportions, roof type, entrance position, window sizes and layout), changes_vs_sheet.',
    ...extraFields,
  ].join('\n');
}

/** Ambiance 8, Axonométrie éclatée. */
export const LABELS_FIELD =
  'labels_fr [string] (ambiance 8, Axonométrie éclatée): short French labels, max 3 words each, for the levels and materials that exist (e.g. Toiture, Étage, Rez-de-chaussée, Dalle, Bardage bois).';
/** Ambiance 13, Schéma d'accès. */
export const ACCESS_FIELD =
  "access_points [{type, location, label_fr}] (ambiance 13, Schéma d'accès): only entrances and access visible in the image (main entrance, back entrance, garage, roof access). label_fr: uppercase, French, max 3 words. Never invent one.";

/** Phase 1 bis — added at the end of the analysis prompt. */
export const LOOK_ADDON = [
  '',
  'Additional task. Only if the image shows a real or already-lit atmosphere (a photograph or a lit render), fill "look". Otherwise set "look" to null.',
  'look fields: mood, weather_visible, season {value, confidence}, vegetation {dominant_trees, understory, deciduous, ground_cover, rocks, composition, palette_hex[]}, light {dominant_source, global_contrast, exposure, highlights, shadows, direction}, white_balance_k_range, grading {exposure_ev, contrast_pct, highlights_pct, shadows_pct, black_point_pct, saturation_pct, greens, yellows_oranges, blues_cyans, clarity, vignette_grain}, photo {focal_mm_range, aperture_range, camera_height_m_range}, recipe (max 150 words, English, reusable in a render prompt), limits[].',
  'Rules for look: every value is an estimate; never present kelvins, EV, focal length, aperture or camera height as measured. Give a confidence level when guessing season or weather. Do not infer time of day, location, rain amount, camera model, lens or LUT. Do not compute pixel statistics. Do not describe the architecture inside look; it belongs to the other fields.',
].join('\n');

/** Ambiance 7, Plan 3D aménagé: a floor plan has its own analysis. */
export function planAnalysisPrompt(sheets: string): string {
  return [
    'Analyze this floor plan. Output valid JSON only.',
    `Project reference sheets: ${sheets}`,
    '',
    'Rules:',
    '- If the image is unreadable or is not a floor plan, output {"status":"unreadable"} and nothing else.',
    "- If reference sheets are provided and this plan shows the same building as one of them (same_building: yes|no|unsure, matched_sheet: its id or null), reuse that sheet's room names, floor materials and furniture exactly. If no or unsure, ignore the sheets.",
    '- Read room names exactly as written on the plan; if none are written, name rooms by function, in French. Give an area only if it is written on the plan; never compute one.',
    '- Where the plan gives no materials, choose: living and dining: large-format light tiles or polished concrete; bedrooms: iroko wood; kitchen and wet rooms: ceramic tiles; terrace: stone paving.',
    '',
    'Fields: status ("ok"), same_building, matched_sheet, rooms [{name, area_if_written, floor_material, key_furniture[]}], openings (doors and windows count), outdoor_areas[], global {render_style, color_palette, lighting, mood, view_type}. Only include fields that change the visual result.',
  ].join('\n');
}

/** Améliorer — the premium finish guide, injected as {library}. */
export const PREMIUM_LIBRARY = [
  'Render or wall paint: lime-based render, fine grain with subtle trowel marks, matte',
  'Concrete: architectural board-formed concrete, fine formwork lines, tiny natural pores, even tone',
  'Wood (cladding, slats): clear-oiled timber slats with visible grain and tight even joints, in the original wood tone (iroko by default for warm brown)',
  'Brick: fired brick, fine mortar joints, slight natural tone variation between bricks',
  'Stone: dressed natural stone, honed face, tight joints, fine natural pores',
  'Tiles and hard floors: large-format porcelain tile, thin joints, soft sheen',
  'Parquet: wide-plank wood flooring, visible grain, satin oil finish',
  'Aluminium joinery: slim matte powder-coated aluminium profiles, crisp edges',
  'Glass: clear low-iron glass, accurate reflections of sky and surroundings, subtle edge tint',
  'Metal (balustrades, roofing): brushed metal with fine linear grain, soft reflections',
  'Outdoor ground: stone pavers with fine joints, subtle natural wear',
  'Lawn and plants: dense healthy turf with natural variation; plants with detailed leaf texture, same plant types as in the image',
  'Textile (interior): true fiber depth, visible weave, natural drape, subtle sheen',
]
  .map((l) => `- ${l}`)
  .join('\n');

/** Améliorer's analysis. */
export function enhanceAnalysisPrompt(sheets: string): string {
  return [
    'Analyze this architectural image in order to improve its material quality. Output valid JSON only.',
    `Project reference sheets: ${sheets}`,
    '',
    'Rules:',
    '- If the image cannot be read or is not an architectural image, output {"status":"unreadable"} and nothing else.',
    "- If reference sheets are provided and this image shows the same building as one of them (same_building: yes|no|unsure, matched_sheet: its id or null), keep that sheet's element names, materials and colors, and reuse its premium_finish for every element that has one. If no or unsure, ignore the sheets.",
    '- List every visible surface or element of the building and its surroundings: walls by level, cladding, roof, window and door frames, glazing, balustrades, paving, ground, boundary wall, and for an interior the floor, walls, ceiling and furniture surfaces.',
    '- For each element give the current material in plain words and its color, a quality_issue (what looks flat, plastic, blurry or repetitive; "none" if good), and a premium_finish: a richer version of the SAME material class and the SAME color family, described in physical detail (grain, joints, sheen, reflections, wear). Use the Premium finish guide below.',
    '- Never replace a material by another type and never change its color family. If the material cannot be identified with confidence, set premium_finish to "keep as is".',
    '- Describe only what is visible. Do not invent anything.',
    '',
    'Fields: status ("ok"), same_building, matched_sheet, type (exterior|interior), lock_summary (one sentence, max 40 words: proportions, roof type, entrance position, window sizes and layout), elements [{element, current_material, color, quality_issue, premium_finish}], changes_vs_sheet.',
    '',
    `Premium finish guide: ${PREMIUM_LIBRARY}`,
  ].join('\n');
}

// ── Defaults (the African setting) ──────────────────────────────────────────

export const DEFAULT_REGION =
  'Abidjan, Côte d’Ivoire (any large African city is fine; stay in Africa unless the user names a place outside Africa)';

export const DEFAULT_FLORA = {
  trees: 'eucalyptus (tall, slender pale trunk, airy canopy); one broad round-crowned shade tree',
  shrubs:
    'dense rounded evergreen shrubs (ligustrum type); clipped low green hedge; mounds of flowering shrubs in red, white and pink; tropical leafy shrub with palm-like fronds',
  ground: 'feathery ornamental grasses; ferns; short lawn',
} as const;

export const INTERIOR_GREENERY = 'potted ferns and a leafy plant with palm-like fronds';

/** Never in a prompt unless the user asked for them (each with the words a
 *  section may use for it). */
export const EXCLUDED_PLANTS: readonly { name: string; words: readonly string[] }[] = [
  { name: 'banana plants', words: ['banana', 'bananier'] },
  { name: 'bougainvillea', words: ['bougainvillea', 'bougainvillier'] },
  { name: 'frangipani', words: ['frangipani', 'frangipanier'] },
  { name: 'hibiscus', words: ['hibiscus'] },
  { name: 'mango trees', words: ['mango', 'manguier'] },
  { name: 'royal palms', words: ['royal palm', 'palmier royal'] },
];

export { AMBIANCE_DEFAULTS, HAZY_DAY_WEATHER } from '@/lib/server/generation/ambiance-text';

// ── Phase 3 · the sections (call 2, ambiances 1 to 6) ───────────────────────

export interface WriterInputs {
  analysis: string;
  defaults: string;
  overrides: string;
  stored: string;
}

export function exteriorWriterPrompt(i: WriterInputs, night: boolean): string {
  return [
    'Write three sections for an architectural render prompt, each under 50 words, in full physical detail: "site", "lighting", "vegetation". Output JSON only, as {"site":"...","lighting":"...","vegetation":"..."}.',
    `Inputs: analysis ${i.analysis}, defaults ${i.defaults}, user overrides ${i.overrides}, stored sections ${i.stored}. User overrides replace defaults. If stored sections are provided, return them unchanged for "site" and "vegetation" and write only "lighting".`,
    '',
    'Rules:',
    '- Setting: Abidjan, Côte d’Ivoire by default. Any large African city is fine. Stay in Africa unless the user explicitly names a place outside Africa.',
    '- Never introduce a material, color or architectural element that is not in the analysis.',
    '- Neighbouring buildings are simple, lower detail, set back, and never hide or compete with the building.',
    ...(night ? ['- Night: the neighbours show only a few distant warm lights.'] : []),
    '- If the analysis shows a tall or high-rise building, describe a full urban backdrop: dense mid-rise fabric, an avenue, street life. The building sits inside the city, not floating.',
    '- Vegetation: use only the default_flora plant types and name at least 4 of them, layered: one tall tree, mid-height shrubs, ground cover. Never write "plants" or "greenery" alone. Never use banana plants, bougainvillea, frangipani, hibiscus, mango trees or royal palms unless the user asks for them.',
    '- Plants stay around and beside the building and never cover or alter the facade, openings, roof or materials.',
  ].join('\n');
}

export function interiorWriterPrompt(i: WriterInputs): string {
  return [
    'Write three sections for an architectural interior render prompt, each under 50 words, in full physical detail: "space", "lighting", "styling". Output JSON only, as {"space":"...","lighting":"...","styling":"..."}.',
    `Inputs: analysis ${i.analysis}, defaults ${i.defaults}, user overrides ${i.overrides}, stored sections ${i.stored}. User overrides replace defaults. If stored sections are provided, return them unchanged for "space" and "styling" and write only "lighting".`,
    '',
    'Rules:',
    '- Setting: Abidjan, Côte d’Ivoire by default; stay in Africa unless the user explicitly names a place outside Africa.',
    '- Never introduce a material, color or architectural element that is not in the analysis.',
    '- Through any window, show a soft garden view slightly out of focus, using the default_flora plant types (eucalyptus, rounded shrubs).',
    '- styling: furniture stays exactly as in the image. Write only small accessories and plants (potted ferns, a leafy plant with palm-like fronds). Never add, remove or replace furniture.',
    '- At night, light comes only from fixtures visible in the image; do not add or move fixtures.',
  ].join('\n');
}

/** Phase 1 bis — added at the end of the writer's prompt. */
export const LOOK_WRITER_ADDON =
  'If "look" in the analysis is not null: follow look.recipe for light quality, palette and grading; keep the vegetation already visible (look.vegetation) instead of replacing it with default_flora; add default_flora types only where the image shows no vegetation. The chosen ambiance still sets time of day, weather and mood.';
