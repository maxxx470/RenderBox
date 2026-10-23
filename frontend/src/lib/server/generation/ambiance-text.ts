// The text each ambiance writes in the command bar (2026-10-19, owner: « le
// prompt intégré dans cette ambiance s'écrit automatiquement dans la
// commande … l'utilisateur peut le lire, le changer avant de lancer »).
//
// Client-safe on purpose (no `server-only`): the browser shows it and lets
// the user edit it; the server sends it as the ambiance's own section and
// still puts the geometry lock first and the materials, the photo look and the
// final check around it (render-profiles.ts). The text shown IS the text sent:
// the server compares what it receives with this same source only to know
// whether the user changed it.
//
// Since 2026-10-20 the fourteen texts are the owner's « Prompts v2 (fidélité
// d'abord) » (renderpro-prompts-v2.pdf): each one is autonomous, opens with the
// transformation wanted, forces fidelity to the source and changes only the
// ambiance asked for — nothing is added or removed. They replace the 2026-10-19
// texts that dressed each ambiance with a setting read from its thumbnail
// (planting, ground, small details). The modules' texts (1 to 6) live in
// presets.ts; the eight looks (7 to 14) are here.
import { PRESETS, type PresetKey } from './presets';
import type { SkyOption } from './templates';

/**
 * Exterior day, the owner's « Clear Sky » text, in its two skies: the clear
 * one is the owner's wording as written, the hazy one (the default, audit
 * decision D2) swaps only its light sentence.
 */
const exteriorDay = (sky: SkyOption) =>
  'Transform this image into a highly realistic exterior architectural photograph, interpreting the scene as a real built environment and not as a 3D render. Strictly preserve all original geometry, elements, proportions, scale, camera angle, framing and composition without any modification. Apply physically accurate materials with natural color variation, realistic roughness and reflectivity. ' +
  (sky === 'sun'
    ? 'Use clear-sky direct sunlight in the late morning, with well-defined shadows and accurate sun direction, combined with natural skylight and ground reflections for balanced exposure. '
    : 'Use soft sunlight in the late morning under a lightly hazy sky, with softened shadows and accurate sun direction, combined with natural skylight and ground reflections for balanced exposure. ') +
  'Do not add, remove or modify any objects, vegetation, materials, people, vehicles or background elements. Keep the scene clean and natural. Adjust color balance, contrast and exposure to match professional architectural photography, with neutral tones and no HDR, filters or stylization. Render in ultra-high resolution with sharp optics, realistic micro-contrast and natural clarity, like a full-frame camera with an architectural lens.';

/** The visible text of each look (7 to 14 of the owner's v2 list). */
export const AMBIANCE_TEXT = {
  SKETCH:
    'Transform this image into a loose, hand-drawn ink sketch with expressive, imperfect pen strokes. Strictly preserve the main geometry, proportions, camera angle and composition of the source. Use uneven line weights, quick gestural contours and subtle hatching to suggest depth without full shading. Keep the drawing raw and artistic, as if sketched rapidly on paper with a fountain pen, with lines that feel spontaneous and fluid while still describing the real building. Do not add elements that are not in the source. White paper background, no color.',
  WATERCOLOUR:
    'Transform this image into an architectural watercolor and ink illustration. Strictly preserve the building’s geometry, proportions, camera angle and composition. Use soft watercolor washes, warm tones, visible brush texture and precise hand-drawn ink contour lines. Render the existing vegetation as loosely painted layered green washes, without adding new plants or objects. Use a light cream paper background to unify the composition and enhance the handcrafted feel. Produce one single illustration: no marginal sketches, no diagrams, no handwritten notes, no text. Cohesive, artistic and professionally illustrated.',
  INTERIOR_DAY:
    'Transform this image into a highly realistic interior architectural photograph, interpreting the scene as a real built space and not as a 3D model. Strictly preserve all original geometry, objects, furniture, proportions, scale, camera angle, framing, colors and spatial relationships, without removing, simplifying, redesigning or adding anything. Apply physically based materials with natural variation in color, roughness and reflectivity. Use bright indirect daylight from a sunny day, with ambient illumination created by reflected sunlight and skylight, so the space looks naturally bright and well lit, while avoiding visible direct sun rays, harsh shadows and light patches. Keep all artificial lights, lamps and fixtures switched off. Create realistic global illumination with balanced light bounces. Adjust color balance, exposure and contrast to match professional interior photography, with neutral natural tones and no HDR, artificial saturation or stylization. Render in ultra-high resolution with true optical sharpness and maximum realism.',
  EXTERIOR_NIGHT:
    'Transform this image into a realistic exterior night photograph. Strictly preserve all original geometry, proportions, materials, camera angle, framing and composition. Change only the time of day: a deep blue night sky, realistic night shadows and soft reflections on glass and surfaces. Switch on only the light sources that exist or are clearly suggested in the source image, with warm, soft light, and let the windows glow warmly from the interior. If the source shows no exterior fixtures, do not invent any. Do not add, remove or modify any objects, vegetation, people or vehicles. Maintain a calm, inviting atmosphere with natural exposure, no HDR and no stylization. Ultra-high resolution, true photographic realism.',
  INTERIOR_NIGHT:
    'Transform this image into a realistic interior night photograph with a warm, cozy atmosphere. Strictly preserve all original geometry, furniture, proportions, materials, colors, camera angle and composition. Change only the time of day and lighting: the windows show a dark night, and only the lamps, ceiling lights and fixtures that exist in the source image are switched on, with soft, warm, inviting light and natural indirect glow. Do not add LED strips, lamps or fixtures that are not present in the source. Keep realistic night shadows and a comfortable, intimate mood. No HDR, no artificial saturation, no stylization. Ultra-high resolution, true photographic realism.',
  GOLDEN_HOUR:
    'Transform this image into a realistic architectural photograph taken during golden hour, shortly before sunset. Strictly preserve all original geometry, proportions, materials, camera angle, framing and composition. Change only the lighting: warm, low-angle sunlight in soft amber tones, long gentle shadows, a glowing sky with subtle gradients and a soft warm rim light on the edges of the architecture. Keep the materials in their true colors: the warm light must tint the scene naturally, without recoloring the building. Do not add, remove or modify any objects, vegetation, people or vehicles. Natural exposure, no HDR, no heavy filters. Ultra-high resolution, cinematic yet realistic architectural photography.',
  RAIN: 'Transform this image into a realistic architectural photograph taken on a rainy day. Strictly preserve all original geometry, proportions, materials, camera angle, framing and composition, without deforming the architecture. Change only the weather: a heavy grey overcast sky, soft diffused light with no hard shadows, visible falling rain, wet ground and surfaces with realistic reflections, small puddles, slightly darker saturated materials, glistening vegetation and subtle mist in the distance. If interior lights are visible in the source, keep them warm and softly glowing. Do not add, remove or modify any objects, people or vehicles. Calm, moody and natural atmosphere, no HDR. Ultra-high resolution, true photographic realism.',
} as const;

/** The owner's common negative prompts (v2): the photographic looks … */
export const PHOTO_AVOID =
  'low resolution, blurry image, unrealistic textures, geometric distortion, architectural deformation, added or removed objects, floating objects, extra people, extra vehicles, watermark, text, signature, overly saturated colors, HDR look, digital noise, compression artifacts, amateur rendering';
/** … and the drawings. */
export const DRAWN_AVOID =
  'photorealistic rendering, added elements not in the source, distorted proportions, watermark, text, signature, low resolution, messy composition';

/** The ambiance's own text (the look presets; '' for the others). */
export function lightTextOf(preset: PresetKey, sky: SkyOption = 'hazy'): string {
  switch (preset) {
    case 'jour_ext':
      return exteriorDay(sky);
    case 'jour_int':
      return AMBIANCE_TEXT.INTERIOR_DAY;
    case 'nuit_ext':
      return AMBIANCE_TEXT.EXTERIOR_NIGHT;
    case 'nuit_int':
      return AMBIANCE_TEXT.INTERIOR_NIGHT;
    case 'heure_doree':
      return AMBIANCE_TEXT.GOLDEN_HOUR;
    case 'pluie':
      return AMBIANCE_TEXT.RAIN;
    case 'croquis':
      return AMBIANCE_TEXT.SKETCH;
    case 'aquarelle':
      return AMBIANCE_TEXT.WATERCOLOUR;
    default:
      return '';
  }
}

/**
 * What picking this ambiance writes in the bar; '' for none (no ambiance, or
 * C0). `sky` only matters to Exterior day.
 */
export function ambianceText(preset: PresetKey | null, sky: SkyOption = 'hazy'): string {
  if (!preset) return '';
  const def = PRESETS[preset].prompt;
  if (def.kind !== 'look') return def.modifier;
  return lightTextOf(preset, sky);
}
