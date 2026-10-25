// The prompt of a render with an ambiance, and Ameliorer's prompt.
//
// THE FOURTEEN AMBIANCES ARE DICTATED TEXTS since 2026-10-25 (owner: « les 28
// textes sont DEFINITIFS ... caractere pour caractere »): each one is the
// owner's own prompt in the language the site is being read in, held in
// ambiance-prompts.ts and sent as it is. What stood here before -- the
// specification's locked blocks (TRANSFORM, BASE DESIGN CONSISTENCY, SITE,
// LIGHTING & MOOD, VEGETATION, SPACE, STYLING, CAMERA, RENDER SPECS, NEGATIVE
// PROMPTS) and the defaults the code filled (Abidjan, the flora, the six
// lights' figures) -- is gone from the prompt: the owner's texts carry their
// own light, materials, vegetation and fidelity clause.
//
// The code adds only two things after that text, both in the wording they
// already had here: the materials recorded on the image (with a pasted
// sheet's lines) and the user's own request. See `ambiancePrompt`.
//
// A material is data, never an instruction: its face and its value are each
// put on ONE line (toPromptLine), so a line break typed or detected inside a
// value cannot start a line of its own in the prompt.
//
// Ameliorer keeps the specification's prompt (`enhancePrompt`), which the
// owner's fourteen texts do not cover.
// The same text goes to Visio and Pixel IA, with the source image.
import 'server-only';
import type { Locale } from '@/lib/i18n/dictionaries';
import { ambiancePromptText } from './ambiance-prompts';
import type { PresetKey } from './presets';
import { toPromptLine, profileLight } from './render-profiles';
import {
  ENHANCE_OPTION_KEYS,
  type EnhanceAmbianceKey,
  type EnhanceOptionKey,
  type EnhanceStrength,
} from './enhance';
import { DARK_ROOM_LINE, ENHANCE_LINES, STRENGTH_LINES } from './enhance-prompt';

/** What {materials} says when the image has none recorded: the engine is
 *  then told nothing, since the ambiance's own text names its materials. */
export const EVERY_MATERIAL_AS_SHOWN = 'every material exactly as shown in the reference image';

// ── Placeholders ────────────────────────────────────────────────────────────

/** {materials}: « element: material », separated by semicolons; each value
 *  on one line, so nothing typed can start a line of its own. */
export function materialsText(materials: readonly { face: string; valeur: string }[]): string {
  const recorded = materials
    .map((m) => ({ face: toPromptLine(m.face), valeur: toPromptLine(m.valeur) }))
    .filter((m) => m.face !== '' && m.valeur !== '')
    .map((m) => `${m.face}: ${m.valeur}`);
  return recorded.length > 0 ? recorded.join('; ') : EVERY_MATERIAL_AS_SHOWN;
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

// -- The prompt of an ambiance --------------------------------------------

/**
 * What the reference images are for (2026-10-25, owner: « ces images-là
 * permettront à Pixel IA et Visio de savoir quel matériau appliquer au
 * nouveau croquis »). Written in the ambiance's own language, so the engine
 * reads one coherent prompt rather than two.
 *
 * It names the three things the owner asked for -- materials, vegetation,
 * sky -- and, every time, the thing it must NOT take: the reference's
 * geometry. A reference is a picture of another building; without that line
 * the engine reshapes the sketch to match it.
 */
function referenceLine(count: number, locale: Locale): string[] {
  if (count < 1) return [];
  const fr =
    count === 1
      ? 'Une image de référence est jointe en plus de l’image source.'
      : `${count} images de référence sont jointes en plus de l’image source.`;
  const en =
    count === 1
      ? 'One reference image is attached besides the source image.'
      : `${count} reference images are attached besides the source image.`;
  return [
    locale === 'fr'
      ? `${fr} Reprenez-en les matériaux, la végétation et le ciel, et appliquez-les à l’image source pour que les deux rendus aillent ensemble. Ne reprenez RIEN d’autre de la référence : ni sa géométrie, ni ses volumes, ni son cadrage, ni ses ouvertures, qui restent exactement ceux de l’image source.`
      : `${en} Take their materials, their vegetation and their sky, and apply them to the source image so that both renders belong together. Take NOTHING else from the references: not their geometry, not their volumes, not their framing, not their openings, which stay exactly those of the source image.`,
  ];
}

/** The one sentence of the old MATERIALS & TEXTURE block that is still sent:
 *  the materials are data about THIS image, so they outlive the texts. */
const KEEP_MATERIALS =
  'Keep every material exactly as identified: same type, same color, same placement. Only enhance realism: true texture depth, natural micro-variation, correct light response. Do not replace, restyle or invent materials.';

/**
 * The prompt of a render with an ambiance (the menu's fourteen, the fan's
 * templates): the owner's dictated text for that ambiance (ambiance-prompts.ts),
 * in the language the site is being read in, or the user's own version of it
 * when they changed it in the bar -- the bar shows the prompt, so what they
 * read is what runs.
 *
 * TWO THINGS THE CODE STILL PUTS AFTER THAT TEXT, and nothing else:
 *  - the materials recorded on the image and the lines of a pasted sheet,
 *    which are data about this one image and no fixed text can carry;
 *  - the user's own request, the words they typed beside the ambiance.
 * Both keep the wording they already had in this file. Each is left out when
 * empty, so an ambiance alone is sent exactly as the owner wrote it, with
 * nothing before it and nothing after it.
 */
export function ambiancePrompt(input: {
  preset: PresetKey;
  /** The language the prompt is written in. */
  locale: Locale;
  materials: readonly { face: string; valeur: string }[];
  /** The user's own words, already joined (userText). */
  request: string;
  /** The ambiance's text as the user left it in the bar, when they changed
   *  it: it then replaces the owner's text. */
  text?: string | undefined;
  /** How many reference images the engine is actually being handed. */
  referenceCount?: number | undefined;
}): string {
  const materials = materialsText(input.materials);
  return [
    input.text ?? ambiancePromptText(input.preset, input.locale),
    ...referenceLine(input.referenceCount ?? 0, input.locale),
    ...(materials === EVERY_MATERIAL_AS_SHOWN ? [] : [`Finishes: ${materials}. ${KEEP_MATERIALS}`]),
    ...requestLine(input.request),
  ].join('\n\n');
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
