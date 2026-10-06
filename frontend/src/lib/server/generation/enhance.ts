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

export const ENHANCE_OPTION_KEYS = ['detail', 'lighting', 'materials', 'sky', 'life'] as const;
export type EnhanceOptionKey = (typeof ENHANCE_OPTION_KEYS)[number];

export const ENHANCE_STRENGTHS = ['subtle', 'strong'] as const;
export type EnhanceStrength = (typeof ENHANCE_STRENGTHS)[number];

/** Pre-ticked on arrival: the three that improve any render. Sky and life
    change the scene's content, so they are opt-in. */
export const DEFAULT_ENHANCE_OPTIONS: EnhanceOptionKey[] = ['detail', 'lighting', 'materials'];

interface EnhanceOptionDef {
  label: { fr: string; en: string };
  hint: { fr: string; en: string };
  prompt: string;
}

export const ENHANCE_OPTIONS: Record<EnhanceOptionKey, EnhanceOptionDef> = {
  detail: {
    label: { fr: 'Netteté et détails', en: 'Sharpness and detail' },
    hint: {
      fr: 'Arêtes nettes, textures fines, sans bruit',
      en: 'Crisp edges, fine texture, no noise',
    },
    prompt:
      'Increase sharpness and fine detail: crisp edges, clean lines, high-resolution textures, remove noise, blur and compression artefacts.',
  },
  lighting: {
    label: { fr: 'Lumière', en: 'Lighting' },
    hint: { fr: 'Ombres et reflets réalistes', en: 'Realistic shadows and reflections' },
    prompt:
      'Improve the lighting while keeping its direction and time of day: physically plausible shadows, soft global illumination, natural reflections and balanced exposure.',
  },
  materials: {
    label: { fr: 'Matériaux', en: 'Materials' },
    hint: { fr: 'Textures plus crédibles', en: 'More believable textures' },
    prompt:
      'Make every material more photorealistic without changing what it is: believable texture, grain, roughness and reflectivity for each surface.',
  },
  sky: {
    label: { fr: 'Ciel et végétation', en: 'Sky and planting' },
    hint: { fr: 'Ciel naturel, plantes vivantes', en: 'Natural sky, lively planting' },
    prompt:
      'Replace a flat or empty sky with a natural, realistic one matching the existing light, and make existing vegetation lush and realistic.',
  },
  life: {
    label: { fr: 'Vie et ambiance', en: 'Life and atmosphere' },
    hint: { fr: 'Quelques personnages discrets', en: 'A few discreet people' },
    prompt:
      'Add subtle signs of life at a believable scale — a few discreet people, small everyday details — without hiding the architecture.',
  },
};

export const ENHANCE_STRENGTH_LABELS: Record<EnhanceStrength, { fr: string; en: string }> = {
  subtle: { fr: 'Léger', en: 'Subtle' },
  strong: { fr: 'Marqué', en: 'Strong' },
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

export function buildEnhancePrompt(input: {
  options: readonly EnhanceOptionKey[];
  strength: EnhanceStrength;
  instruction?: string | undefined;
}): string {
  // Fixed order regardless of click order, and each option once — the prompt
  // for a given set of ticks is always the same string.
  const picked = ENHANCE_OPTION_KEYS.filter((k) => input.options.includes(k));
  const parts = [
    PRESERVE,
    ...picked.map((k) => ENHANCE_OPTIONS[k].prompt),
    STRENGTH_PROMPT[input.strength],
  ];
  if (input.instruction?.trim()) parts.push(input.instruction.trim());
  return parts.join('\n');
}
