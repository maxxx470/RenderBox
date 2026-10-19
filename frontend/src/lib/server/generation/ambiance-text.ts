// The text each ambiance writes in the command bar (2026-10-19, owner: « le
// prompt intégré dans cette ambiance s'écrit automatiquement dans la
// commande … l'utilisateur peut le lire, le changer avant de lancer »).
//
// Client-safe on purpose (no `server-only`): the browser shows it and lets
// the user edit it; the server sends it as the ambiance's own section —
// the light, the drawing or the representation — and still puts the geometry
// lock first and the materials, the photo look and the final check around it
// (render-profiles.ts). A text left as written is not even sent as an edit:
// the server compares it with this same source, so the structured profile
// of each engine (render-profiles.ts) stays the default.
import { PRESETS, type PresetKey } from './presets';
import type { SkyOption } from './templates';

/** The visible text of each light and drawing — Visio's own wording. */
export const AMBIANCE_TEXT = {
  EXTERIOR_DAY_HAZY:
    'Natural daylight under a lightly hazy sky, sun at 30 to 45 degrees elevation, shadows defined but softened, neutral white balance around 5600 K. Exposure 0 to +0.3 EV, facade not overexposed. Medium filmic contrast. Saturation -5 to 0 percent, natural vegetation green, never neon.',
  EXTERIOR_DAY_SUN:
    'Natural daylight, direct sun at 30 to 45 degrees elevation, clear sky, crisp but softened shadows, neutral white balance around 5600 K. Exposure 0 to +0.3 EV, facade not overexposed. Medium filmic contrast. Saturation -5 to 0 percent, natural vegetation green, never neon.',
  INTERIOR_DAY:
    'Soft diffused daylight, like an overcast sky, entering through the windows and filtering through blinds or curtains. Long soft shadows, never hard. Neutral slightly warm white balance around 4800 K, with small warm accents from practical lamps around 2700 K. Balanced exposure around -0.3 to 0 EV, open shadows, window view keeps detail, no blown-out windows. Soft filmic contrast with slightly lifted blacks. Overall saturation lowered by about 10 to 15 percent while a few accent colors stay readable. Realistic global illumination with gentle warm color bounce.',
  EXTERIOR_NIGHT:
    'Blue hour exterior, deep blue sky, facade lit by architectural lighting around 2800 K, warm glowing windows, slightly reflective ground. Exposure -0.7 to -0.3 EV, medium-high contrast, controlled glow, soft light falloff. Saturation 0 to +5 percent.',
  INTERIOR_NIGHT:
    'Evening interior lit by practical lamps and indirect lighting around 2700 K, with subtle warm spot accents. Windows show a deep blue night around 7500 K. The room stays readable, never black. Exposure -0.3 to 0 EV, medium-high contrast with shadows still detailed. Saturation lowered by about 5 percent. Warm pools of light, soft falloff, realistic global illumination.',
  GOLDEN_HOUR:
    'Golden hour, sun low at 5 to 15 degrees elevation, warm raking light around 3500 K on the facades and through the windows, long soft shadows, sky graded from warm amber near the horizon to soft blue above. Exposure -0.3 to 0 EV, sunlit highlights kept, shadows open with a cool natural fill. Medium filmic contrast. Saturation 0 to +5 percent, warm but natural, never orange overall.',
  RAIN: 'Rainy overcast day, soft even light from a grey sky, neutral to slightly cool white balance around 6500 K. Wet ground and wet horizontal surfaces with true reflections of the building, a few shallow puddles, darker and richer tones where surfaces are wet, a light drizzle barely visible, a little mist in the distance. Warm interior light glowing softly in the existing windows around 3000 K. Exposure -0.3 to 0 EV, facade still readable. Soft contrast. Saturation -10 to -5 percent.',
  SKETCH:
    'Drawing: architectural design sketch on off-white paper, visible pencil lines, simplified volumes, light shading, neutral light, graphite tones with at most one or two soft accent tints. Each material stays recognisable by its line and hatching. Keep it a design drawing, not a photograph.',
  WATERCOLOUR:
    'Drawing: architectural watercolour illustration on textured cold-press paper, fine ink outline of the building, transparent washes with soft bleeding edges, the white of the paper left in the highlights, natural muted colours true to the source materials, the sky as a light loose wash. Each material stays recognisable by its colour and brushwork. Keep it a hand-painted illustration, not a photograph.',
} as const;

/**
 * What picking this ambiance writes in the bar; '' for none (no ambiance, or
 * C0). `sky` only matters to Exterior day.
 */
export function ambianceText(preset: PresetKey | null, sky: SkyOption = 'hazy'): string {
  if (!preset) return '';
  const def = PRESETS[preset].prompt;
  if (def.kind !== 'look') return def.modifier;
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
