// The lines of Améliorer's own choices (2026-10-19, the owner's prompt audit,
// D6, annex C): one per improvement the page offers, the « pièce sombre »
// sub-option and the three intensities. Since 2026-10-22 the prompt itself is
// built from Claude's analysis of the image (lib/server/analysis/assemble.ts,
// enhancePrompt), which adds these lines as the user's request. Only the
// source image is sent: no reference image of any kind (D8).
import 'server-only';
import type { EnhanceOptionKey, EnhanceStrength } from './enhance';

/** Annex C, verbatim. */
export const ENHANCE_LINES: Record<EnhanceOptionKey, string> = {
  sharpness:
    'Improve sharpness and edge definition, reduce blur, noise, aliasing and render artifacts. Do not change shapes or composition.',
  detail:
    'Bring out textures, joints, reliefs and finishing details. Do not change the number or position of elements.',
  lighting:
    'Improve exposure, natural light, shadows and contrast: balanced exposure, open shadows, no blown windows. Do not change material colors.',
  materials:
    "Improve how light renders each existing material. Do not change any material's nature or color.",
  sky: 'Improve the sky and its integration into the overall lighting, lightly hazy by default. Do not touch the building or its cast shadows.',
  vegetation:
    'Improve trees, plants and lawns: varied foliage, natural green, believable integration. Do not move trees unless instructed.',
  life: 'Improve the credibility of people, objects and furniture already present. Do not add anything if nothing was there.',
  ambiance:
    'Harmonize the overall atmosphere using the lighting guidance of the selected profile. Do not change geometry.',
};

export const DARK_ROOM_LINE =
  'Raise exposure by about +1 to +1.5 stops, open the shadows, add warm accent light around 3000 K. Protect colors: no saturation or hue shift while brightening.';

export const STRENGTH_LINES: Record<EnhanceStrength, string> = {
  subtle: 'Intensity: subtle, barely noticeable improvement.',
  medium: 'Intensity: clear but natural improvement.',
  strong:
    'Intensity: strong improvement, while keeping the original look; fidelity to the source always comes first.',
};
