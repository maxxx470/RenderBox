// The text each ambiance writes in the command bar (2026-10-19, owner: « le
// prompt intégré dans cette ambiance s'écrit automatiquement dans la
// commande … l'utilisateur peut le lire, le changer avant de lancer »).
//
// Client-safe on purpose (no `server-only`): the browser shows it and lets
// the user edit it. Since 2026-10-22 (owner: « Spécification des prompts et du
// pipeline d'analyse », which replaced the prompts v2) the prompt itself is
// assembled on the server from Claude's analysis of the image
// (lib/server/analysis/): what the bar shows is what the ambiance sets —
// the time, the weather, the mood, the setting, or the kind of picture. The
// server compares what it receives with this same source: left as it is, the
// defaults apply; changed, the user's words replace them (« ce qu'il écrit
// remplace le réglage par défaut correspondant ») — they never lift the
// geometry or materials lock.
import type { PresetKey, WrittenPreset } from './presets';
import type { SkyOption } from './templates';

/** The six ambiances' defaults (specification, « Réglages par ambiance »). */
export const AMBIANCE_DEFAULTS: Record<
  WrittenPreset,
  { time: string; weather: string; mood: string; effects: string }
> = {
  jour_ext: {
    time: 'late morning, around 10-11 am',
    weather: 'blue sky with a few clouds, dry season',
    mood: 'crisp, bright',
    effects: 'none',
  },
  heure_doree: {
    time: 'late afternoon, golden hour',
    weather: 'clear sky, low raking sunlight',
    mood: 'warm',
    effects: 'long soft shadows, warm glow on the facade, subtle haze',
  },
  pluie: {
    time: 'daytime',
    weather: 'overcast sky, light drizzle, wet ground',
    mood: 'calm, saturated greens',
    effects:
      'reflections on wet paving, damp surfaces slightly darker, thin mist between the trees',
  },
  nuit_ext: {
    time: 'dusk into night (blue hour)',
    weather: 'dark clear sky, warm interior and exterior lights switched on',
    mood: 'welcoming',
    effects: 'warm glow behind the glazing, soft pools of light on the ground',
  },
  jour_int: {
    time: 'morning',
    weather: 'soft light through the openings',
    mood: 'calm',
    effects: 'subtle sunbeams',
  },
  nuit_int: {
    time: 'evening',
    weather:
      'dark windows with a few faint garden lights, warm light from the fixtures visible in the image',
    mood: 'intimate',
    effects: 'soft pools of light',
  },
};

/** Exterior day's sky chip (D2, kept): the specification's clear sky with
 *  « Soleil franc », a lightly hazy one with « Voilé » (the chip's default). */
export const HAZY_DAY_WEATHER = 'blue sky with a few soft clouds and a light haze, dry season';

/** The default setting (specification: the frame is Africa). */
export const DEFAULT_SETTING = 'Abidjan, Côte d’Ivoire';

/** The weather of an ambiance, Exterior day's sky applied. */
export function ambianceWeather(preset: WrittenPreset, sky: SkyOption = 'hazy'): string {
  return preset === 'jour_ext' && sky !== 'sun'
    ? HAZY_DAY_WEATHER
    : AMBIANCE_DEFAULTS[preset].weather;
}

/** What the eight fixed ambiances make (their prompts are fixed texts). */
const FIXED_TEXT: Record<Exclude<PresetKey, WrittenPreset>, string> = {
  plan_3d:
    'Furnished 3D plan seen from above, roof removed, walls cut; room names as on the plan, only the furniture the analysis lists.',
  eclate:
    'Exploded axonometric diagram: the building’s layers floating apart, seen from a corner at 45 degrees, white background, short labels in French.',
  analyse:
    'Analysis board: main view, massing, schematic section and material swatches, white background, short titles in French.',
  isometrie:
    'Isometric presentation view from above at 45 degrees, light grey background, a thin base under the building, minimal planting.',
  maquette_blanche:
    'White clay architectural model on a light base in soft studio light: one off-white material, no colour, no texture.',
  esquisse:
    'Access diagram: white massing model from above at 45 degrees, thin dark arrows on the entrances the image shows, labels in French.',
  croquis:
    'Graphite pencil sketch on white paper: shading, hatching, visible construction lines, no colour.',
  aquarelle:
    'Watercolour illustration: translucent washes in the materials’ own colours, visible paper grain, loose pale sky.',
};

/**
 * What picking this ambiance writes in the bar; '' for none. `sky` only
 * matters to Exterior day.
 */
export function ambianceText(preset: PresetKey | null, sky: SkyOption = 'hazy'): string {
  if (!preset) return '';
  if (preset in FIXED_TEXT) return FIXED_TEXT[preset as keyof typeof FIXED_TEXT];
  const p = preset as WrittenPreset;
  const d = AMBIANCE_DEFAULTS[p];
  const effects = d.effects === 'none' ? '' : ` ${capital(d.effects)}.`;
  return `${capital(d.time)}; ${ambianceWeather(p, sky)}; ${d.mood} mood.${effects} Setting: ${DEFAULT_SETTING}.`;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
