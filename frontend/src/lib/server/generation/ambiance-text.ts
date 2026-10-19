// The text each ambiance writes in the command bar (2026-10-19, owner: « le
// prompt intégré dans cette ambiance s'écrit automatiquement dans la
// commande … l'utilisateur peut le lire, le changer avant de lancer »).
//
// Client-safe on purpose (no `server-only`): the browser shows it and lets
// the user edit it; the server sends it as the ambiance's own sections —
// the light (or the drawing), then the setting — and still puts the geometry
// lock first and the materials, the photo look and the final check around it
// (render-profiles.ts). A text left as written is not even sent as an edit:
// the server compares it with this same source, so the structured profile
// of each engine (render-profiles.ts) stays the default.
//
// Since the owner's second pass (« les prompts … se détachent trop de ce qu'il
// y a sur les vignettes »), each ambiance is written from its own thumbnail:
// the light with its figures and its palette, then the SETTING the thumbnail
// shows around the building — the planting, the ground, the small details —,
// so a render carries the same composition. The setting only dresses what the
// image already has (ground, terraces, balconies, openings) and never adds an
// architectural element; what the user states (materials, a request, an edit
// of the text) always comes first.
import { PRESETS, type PresetKey } from './presets';
import type { SkyOption } from './templates';

/** The visible text of each light and drawing — Visio's own wording. */
export const AMBIANCE_TEXT = {
  EXTERIOR_DAY_HAZY:
    'Natural daylight under a lightly hazy sky, sun at 30 to 45 degrees elevation, shadows defined but softened, neutral white balance around 5600 K. Exposure 0 to +0.3 EV, facade not overexposed. Medium filmic contrast. Saturation -5 to 0 percent, natural vegetation green, never neon. Palette: a pale clean blue sky, softly cool shadows, fresh natural greens.',
  EXTERIOR_DAY_SUN:
    'Natural daylight, direct sun at 30 to 45 degrees elevation, clear sky, crisp but softened shadows, neutral white balance around 5600 K. Exposure 0 to +0.3 EV, facade not overexposed. Medium filmic contrast. Saturation -5 to 0 percent, natural vegetation green, never neon. Palette: a deep clean blue sky, crisp cool shadows, fresh natural greens.',
  INTERIOR_DAY:
    'Soft diffused daylight, like an overcast sky, entering through the windows and filtering through blinds or curtains. Long soft shadows, never hard. Neutral slightly warm white balance around 4800 K, with small warm accents from practical lamps around 2700 K. Balanced exposure around -0.3 to 0 EV, open shadows, window view keeps detail, no blown-out windows. Soft filmic contrast with slightly lifted blacks. Overall saturation lowered by about 10 to 15 percent while a few accent colors stay readable. Realistic global illumination with gentle warm color bounce. Palette: warm cream, sand and oat tones in soft white light.',
  EXTERIOR_NIGHT:
    'Blue hour exterior, deep blue sky, facade lit by architectural lighting around 2800 K, warm glowing windows, slightly reflective ground. Exposure -0.7 to -0.3 EV, medium-high contrast, controlled glow, soft light falloff. Saturation 0 to +5 percent. Palette: deep indigo and teal sky and shadows against warm amber windows.',
  INTERIOR_NIGHT:
    'Evening interior lit by practical lamps and indirect lighting around 2700 K, with subtle warm spot accents. Windows show a deep blue night around 7500 K. The room stays readable, never black. Exposure -0.3 to 0 EV, medium-high contrast with shadows still detailed. Saturation lowered by about 5 percent. Warm pools of light, soft falloff, realistic global illumination. Palette: deep bronze, chocolate brown and near-black against warm amber light.',
  GOLDEN_HOUR:
    'Golden hour, sun low at 5 to 15 degrees elevation, warm raking light around 3500 K on the facades and through the windows, long soft shadows, sky graded from warm amber near the horizon to soft blue above. Exposure -0.3 to 0 EV, sunlit highlights kept, shadows open with a cool natural fill. Medium filmic contrast. Saturation 0 to +5 percent, warm but natural, never orange overall. Palette: honey, amber and soft peach on the facades, cool lavender-blue in the upper sky and in the shadows.',
  RAIN: 'Rainy overcast day, soft even light from a grey sky, neutral to slightly cool white balance around 6500 K. Wet ground and wet horizontal surfaces with true reflections of the building, a few shallow puddles, darker and richer tones where surfaces are wet, a light drizzle barely visible, a little mist in the distance. Warm interior light glowing softly in the existing windows around 3000 K. Exposure -0.3 to 0 EV, facade still readable. Soft contrast. Saturation -10 to -5 percent. Palette: cool slate and grey tones with warm amber from the windows.',
  SKETCH:
    'Drawing: architectural design sketch on off-white paper in fine graphite pencil, visible pencil lines, a few perspective construction lines left in, loose hatching on walls and glazing, simplified volumes, light shading, neutral light. The drawing is graphite grey only, with no colour. Each material stays recognisable by its line and hatching. Keep it a design drawing, not a photograph.',
  WATERCOLOUR:
    'Drawing: architectural watercolour illustration on textured cold-press paper, fine ink outline of the building, transparent washes with soft bleeding edges, the white of the paper left in the highlights, natural muted colours true to the source materials, the sky as a light loose wash. Each material stays recognisable by its colour and brushwork. Palette: muted sage, olive and moss greens, warm ochre and umber, a soft grey-blue sky wash. Keep it a hand-painted illustration, not a photograph.',
} as const;

/** The looks that carry a setting: the lights and the two drawings. */
export type SettingKey =
  | 'jour_ext'
  | 'jour_int'
  | 'nuit_ext'
  | 'nuit_int'
  | 'heure_doree'
  | 'pluie'
  | 'croquis'
  | 'aquarelle';

/**
 * What the owner asked of the ground (2026-10-19), on the surfaces the image
 * already has: green becomes a natural lawn, sand stays sand with its own
 * plants and a little dust, the street keeps its wear.
 */
const GROUND_DRY = [
  'where the ground is green, make it a natural lawn with low plants, small flowers and shrubs, with a few fallen dry leaves near the street edge',
  'where the ground is sand or beige earth, keep it fine sand with a few plants that grow in sand, and a light dust rising over the road',
  'keep paved and tarred surfaces as they are, with natural wear',
];

const GROUND_WET = [
  'where the ground is green, make it a natural wet lawn with low plants, small flowers, shrubs and a few fallen leaves near the street edge',
  'where the ground is sand or beige earth, keep it dark wet sand with a few plants that grow in sand',
  'keep paved and tarred surfaces as they are, glistening with rain',
];

/** Said once, after every setting: additions dress the image, never build it. */
export const SETTING_SCOPE =
  'These additions are explicitly requested, only on ground, terraces, balconies and openings the image already has; never a new wall, window, roof, volume or other architectural element.';

/** One item per detail the ambiance's thumbnail shows around the building. */
export const SETTING_ITEMS: Record<SettingKey, readonly string[]> = {
  jour_ext: [
    'mature leafy street trees framing the building wherever there is room beside it',
    'climbing and trailing plants softly draping from the existing balconies, terraces and walls',
    'a few small pedestrians walking on the pavement',
    'thin white wisps of cloud in the sky',
    ...GROUND_DRY,
  ],
  jour_int: [
    'sheer white curtains softly filtering the window light',
    'the view through the window kept readable (sea, sky or garden, as the source shows)',
    'natural linen and wool throws and cushions on any bed or seating',
    'a cup and a book on a ledge or side table',
    'one person quietly resting, only where there is a bed or a sofa',
  ],
  nuit_ext: [
    'warm light glowing in every window',
    'soft uplighting on stairs, terraces and walls',
    'terraces and roofs planted with agave, olive and Mediterranean shrubs, lit from below',
    'where the plot has water, a deep teal surface reflecting the lights',
    'a few small warm lanterns along paths and steps',
    ...GROUND_DRY,
  ],
  nuit_int: [
    'warm LED strip light under counters, shelves and joinery',
    'black pendant lamps and a globe floor lamp glowing warmly',
    'a polished floor reflecting the lights',
    'large potted plants lit from below',
    'dark glazing showing a deep blue night with a few reflected lights',
    'a soft rug and a curved sofa, only where there is a seating area',
  ],
  heure_doree: [
    'warm backlit ornamental grasses and Mediterranean shrubs in the garden',
    'a mature olive tree in front of the facade, wherever the plot has room',
    'pale natural stone paving and sun loungers on the terrace',
    'where the plot has a pool, a still surface reflecting the warm sky',
    'interior lights glowing softly behind the glass',
    ...GROUND_DRY,
  ],
  pluie: [
    'wet concrete and stone paving with clear reflections of the building and of its lit windows',
    'light gravel and dark wet soil beside the paving',
    'tall trees fading into soft mist behind the building',
    'low garden path lights switched on',
    'ripples from raindrops in the puddles',
    'an outdoor table and chairs on the terrace, beaded with rain',
    ...GROUND_WET,
  ],
  croquis: [
    'a boundary wall and a gate drawn with a few clean lines, where the source has them',
    'shrubs and trees drawn as loose scribbled foliage, where the source has planting',
    'the street and its kerb indicated by two or three long lines',
  ],
  aquarelle: [
    'birch and pine trees, ornamental grasses and shrubs painted in loose washes around the building',
    'a flagstone path leading to the entrance, where the source has a path or a forecourt',
    'where the plot has water, a calm pool painted in pale teal',
    'the painting fading irregularly into bare paper at its edges, with a few loose splatters',
  ],
};

/** The setting as one paragraph — Visio's wording and what the bar shows. */
export function settingText(key: SettingKey): string {
  return `Setting: ${SETTING_ITEMS[key].join('; ')}. ${SETTING_SCOPE}`;
}

/** The setting as Pixel IA's lines. */
export function settingLines(key: SettingKey): string[] {
  return [...SETTING_ITEMS[key].map((item) => `- ${item}.`), `- ${SETTING_SCOPE}`];
}

/** The setting each look carries (none for C0). */
export function settingKeyOf(preset: string): SettingKey | null {
  return preset in SETTING_ITEMS ? (preset as SettingKey) : null;
}

/** The ambiance's own light or drawing text, without its setting. */
export function lightTextOf(preset: PresetKey, sky: SkyOption = 'hazy'): string {
  switch (preset) {
    case 'jour_ext':
      return sky === 'sun' ? AMBIANCE_TEXT.EXTERIOR_DAY_SUN : AMBIANCE_TEXT.EXTERIOR_DAY_HAZY;
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
  const key = settingKeyOf(preset);
  const light = lightTextOf(preset, sky);
  return key ? `${light} ${settingText(key)}` : light;
}
