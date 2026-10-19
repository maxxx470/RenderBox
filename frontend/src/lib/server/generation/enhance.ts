// Enhance — improve an existing render without redesigning it: what the page
// offers (the improvements, the intensity, the ambiance's profile) and their
// labels. The prompt itself is built on the server (enhance-prompt.ts).
//
// No I/O and no `server-only` tag: the page imports the option list and the
// labels, like presets.ts.
import { TEMPLATES, TEMPLATE_KEYS, type TemplateKey } from './templates';

// Eight since 2026-10-19 (the owner's prompt audit, D6, annex C): sharpness,
// details, light, materials, sky, vegetation, life and scene elements,
// ambiance. « Pièce sombre » is a sub-option of Lumière, not a ninth.
export const ENHANCE_OPTION_KEYS = [
  'sharpness',
  'detail',
  'lighting',
  'materials',
  'sky',
  'vegetation',
  'life',
  'ambiance',
] as const;
export type EnhanceOptionKey = (typeof ENHANCE_OPTION_KEYS)[number];

/** Three since 2026-10-19 (D6), medium by default. */
export const ENHANCE_STRENGTHS = ['subtle', 'medium', 'strong'] as const;
export type EnhanceStrength = (typeof ENHANCE_STRENGTHS)[number];
export const DEFAULT_ENHANCE_STRENGTH: EnhanceStrength = 'medium';

/** The profiles « Ambiance » harmonises towards: the four lights. */
export const ENHANCE_AMBIANCE_KEYS = TEMPLATE_KEYS;
export type EnhanceAmbianceKey = TemplateKey;
export const ENHANCE_AMBIANCE_LABELS: Record<EnhanceAmbianceKey, { fr: string; en: string }> = {
  jour_ext: TEMPLATES.jour_ext.label,
  jour_int: TEMPLATES.jour_int.label,
  nuit_ext: TEMPLATES.nuit_ext.label,
  nuit_int: TEMPLATES.nuit_int.label,
};

/** Pre-ticked on arrival: the four that improve any render. Sky, planting,
    life and ambiance touch the scene's content, so they are opt-in. */
export const DEFAULT_ENHANCE_OPTIONS: EnhanceOptionKey[] = [
  'sharpness',
  'detail',
  'lighting',
  'materials',
];

interface EnhanceOptionDef {
  label: { fr: string; en: string };
  hint: { fr: string; en: string };
}

export const ENHANCE_OPTIONS: Record<EnhanceOptionKey, EnhanceOptionDef> = {
  sharpness: {
    label: { fr: 'Netteté', en: 'Sharpness' },
    hint: { fr: 'Arêtes nettes, sans flou ni bruit', en: 'Crisp edges, no blur or noise' },
  },
  detail: {
    label: { fr: 'Détails', en: 'Details' },
    hint: { fr: 'Textures, joints et finitions', en: 'Textures, joints and finishes' },
  },
  lighting: {
    label: { fr: 'Lumière', en: 'Lighting' },
    hint: { fr: 'Exposition, ombres et contraste', en: 'Exposure, shadows and contrast' },
  },
  materials: {
    label: { fr: 'Matériaux', en: 'Materials' },
    hint: { fr: 'Plus crédibles, même matière', en: 'More believable, same material' },
  },
  sky: {
    label: { fr: 'Ciel', en: 'Sky' },
    hint: { fr: 'Un ciel naturel, accordé à la lumière', en: 'A natural sky matching the light' },
  },
  vegetation: {
    label: { fr: 'Végétation', en: 'Planting' },
    hint: { fr: 'Feuillages variés, vert naturel', en: 'Varied foliage, natural green' },
  },
  life: {
    label: { fr: 'Vie et éléments de scène', en: 'Life and scene elements' },
    hint: { fr: 'Personnes et objets déjà présents', en: 'People and objects already there' },
  },
  ambiance: {
    label: { fr: 'Ambiance', en: 'Atmosphere' },
    hint: { fr: 'Harmonisée selon un profil', en: 'Harmonised to a profile' },
  },
};

/** Lumière's sub-option (annex C): brighten a dark room, colours kept. */
export const DARK_ROOM_LABEL = { fr: 'Pièce sombre', en: 'Dark room' };
export const DARK_ROOM_HINT = {
  fr: 'Éclaircit sans changer les couleurs',
  en: 'Brightens without shifting colours',
};

export const ENHANCE_STRENGTH_LABELS: Record<EnhanceStrength, { fr: string; en: string }> = {
  subtle: { fr: 'Léger', en: 'Subtle' },
  medium: { fr: 'Moyen', en: 'Medium' },
  strong: { fr: 'Fort', en: 'Strong' },
};

/** One line under each intensity, so the choice is made by what the user
    wants, not by a percentage (owner, 2026-10-08: no 0–100 % slider). */
export const ENHANCE_STRENGTH_HINTS: Record<EnhanceStrength, { fr: string; en: string }> = {
  subtle: { fr: 'Même image, plus propre', en: 'Same image, cleaner' },
  medium: { fr: 'Net mais naturel', en: 'Clear but natural' },
  strong: { fr: 'Rendu photo haut de gamme', en: 'High-end photo finish' },
};

export function isEnhanceOptionKey(value: string): value is EnhanceOptionKey {
  return (ENHANCE_OPTION_KEYS as readonly string[]).includes(value);
}
