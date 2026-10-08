// Enhance — improve an existing render without redesigning it.
//
// The generate route turns a photo or sketch INTO a render, under one of the
// five ambiance presets. Enhance starts from something that is already a
// render and makes it better: sharper, better lit, more believable. So the
// prompt is built the other way round — it leads with what must NOT change
// (framing, geometry, design), then lists only the improvements the user
// ticked. No preset modifier: an ambiance would relight the scene, which is
// exactly the redesign this mode promises not to do.
//
// No I/O and no `server-only` tag: the page imports the option list and the
// labels, like presets.ts.

// Seven since 2026-10-08 (owner): "Netteté et détails" and "Ciel et
// végétation" were split, so each can be ticked, and given a reference, alone.
export const ENHANCE_OPTION_KEYS = [
  'sharpness',
  'detail',
  'lighting',
  'materials',
  'sky',
  'vegetation',
  'life',
] as const;
export type EnhanceOptionKey = (typeof ENHANCE_OPTION_KEYS)[number];

export const ENHANCE_STRENGTHS = ['subtle', 'strong'] as const;
export type EnhanceStrength = (typeof ENHANCE_STRENGTHS)[number];

/** Pre-ticked on arrival: the four that improve any render. Sky, planting and
    life change the scene's content, so they are opt-in. */
export const DEFAULT_ENHANCE_OPTIONS: EnhanceOptionKey[] = [
  'sharpness',
  'detail',
  'lighting',
  'materials',
];

interface EnhanceOptionDef {
  label: { fr: string; en: string };
  hint: { fr: string; en: string };
  prompt: string;
  /** What a reference image attached to this option is a guide for. */
  reference: string;
}

export const ENHANCE_OPTIONS: Record<EnhanceOptionKey, EnhanceOptionDef> = {
  sharpness: {
    label: { fr: 'Netteté', en: 'Sharpness' },
    hint: { fr: 'Arêtes nettes, sans flou ni bruit', en: 'Crisp edges, no blur or noise' },
    prompt:
      'Increase sharpness: crisp edges and clean lines, remove noise, blur and compression artefacts.',
    reference: 'the level of sharpness and clarity',
  },
  detail: {
    label: { fr: 'Détail', en: 'Detail' },
    hint: { fr: 'Textures fines, petits éléments lisibles', en: 'Fine texture, legible details' },
    prompt:
      'Add fine detail: high-resolution textures and legible small elements (joints, frames, fixtures), without inventing new building elements.',
    reference: 'the amount and kind of fine detail',
  },
  lighting: {
    label: { fr: 'Lumière', en: 'Lighting' },
    hint: { fr: 'Ombres et reflets réalistes', en: 'Realistic shadows and reflections' },
    prompt:
      'Improve the lighting while keeping its direction and time of day: physically plausible shadows, soft global illumination, natural reflections and balanced exposure.',
    reference: 'the lighting mood, its warmth and contrast',
  },
  materials: {
    label: { fr: 'Matériaux', en: 'Materials' },
    hint: { fr: 'Textures plus crédibles', en: 'More believable textures' },
    prompt:
      'Make every material more photorealistic without changing what it is: believable texture, grain, roughness and reflectivity for each surface.',
    reference: 'the look of the materials and finishes (texture, grain, colour, reflectivity)',
  },
  sky: {
    label: { fr: 'Ciel', en: 'Sky' },
    hint: { fr: 'Un ciel naturel, accordé à la lumière', en: 'A natural sky matching the light' },
    prompt:
      'Replace a flat or empty sky with a natural, realistic one matching the existing light.',
    reference: 'the sky',
  },
  vegetation: {
    label: { fr: 'Végétation', en: 'Planting' },
    hint: { fr: 'Plantes et arbres vivants', en: 'Lively plants and trees' },
    prompt:
      'Make the existing vegetation lush and realistic — plants, trees, lawns — without hiding the architecture.',
    reference: 'the planting: species, density and colour',
  },
  life: {
    label: { fr: 'Vie et ambiance', en: 'Life and atmosphere' },
    hint: { fr: 'Quelques personnages discrets', en: 'A few discreet people' },
    prompt:
      'Add subtle signs of life at a believable scale — a few discreet people, small everyday details — without hiding the architecture.',
    reference: 'the atmosphere and the kind of life in the scene',
  },
};

export const ENHANCE_STRENGTH_LABELS: Record<EnhanceStrength, { fr: string; en: string }> = {
  subtle: { fr: 'Léger', en: 'Subtle' },
  strong: { fr: 'Marqué', en: 'Strong' },
};

/** One line under each intensity, so the choice is made by what the user
    wants, not by a percentage (owner, 2026-10-08: no 0–100 % slider). */
export const ENHANCE_STRENGTH_HINTS: Record<EnhanceStrength, { fr: string; en: string }> = {
  subtle: { fr: 'Même image, plus propre', en: 'Same image, cleaner' },
  strong: { fr: 'Rendu photo haut de gamme', en: 'High-end photo finish' },
};

const PRESERVE =
  'Enhance this architectural render. Keep the exact same composition, camera angle, framing, geometry, proportions, design and colours — do not add, remove or move any building element.';

const STRENGTH_PROMPT: Record<EnhanceStrength, string> = {
  subtle: 'Apply the improvements subtly: the result must read as the same image, only cleaner.',
  strong:
    'Apply the improvements clearly, aiming for a high-end photorealistic architectural visualisation, while still preserving the design exactly.',
};

export function isEnhanceOptionKey(value: string): value is EnhanceOptionKey {
  return (ENHANCE_OPTION_KEYS as readonly string[]).includes(value);
}

/**
 * The prompt for one run. `references` lists, in the order the images are
 * sent after the source, the option each reference image belongs to — one
 * per ticked option at most (owner, 2026-10-08). With no option ticked, the
 * free-text instruction alone says what to improve.
 */
export function buildEnhancePrompt(input: {
  options: readonly EnhanceOptionKey[];
  strength: EnhanceStrength;
  instruction?: string | undefined;
  references?: readonly EnhanceOptionKey[] | undefined;
}): string {
  // Fixed order regardless of click order, and each option once — the prompt
  // for a given set of ticks is always the same string.
  const picked = ENHANCE_OPTION_KEYS.filter((k) => input.options.includes(k));
  const parts = [PRESERVE, ...picked.map((k) => ENHANCE_OPTIONS[k].prompt)];
  const refs = input.references ?? [];
  if (refs.length > 0) {
    parts.push(
      'The first image is the render to enhance. The other images are references only: use each one solely as a guide for the aspect named below, and never copy its building, composition or camera.',
      ...refs.map((k, i) => `Image ${i + 2} is a reference for ${ENHANCE_OPTIONS[k].reference}.`),
    );
  }
  parts.push(STRENGTH_PROMPT[input.strength]);
  if (input.instruction?.trim()) parts.push(input.instruction.trim());
  return parts.join('\n');
}
