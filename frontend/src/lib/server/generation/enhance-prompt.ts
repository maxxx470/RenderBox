// The prompt of Améliorer, built on the server (2026-10-19, the owner's
// prompt audit, D6, annex C). The geometry lock and the materials block stay
// on whatever is ticked, so one improvement can never lift another's
// protection; each improvement says what it may NOT change. Only the source
// image is sent: no reference image of any kind (D8).
import 'server-only';
import type { EngineName } from './engines/types';
import {
  ENHANCE_OPTION_KEYS,
  type EnhanceAmbianceKey,
  type EnhanceOptionKey,
  type EnhanceStrength,
} from './enhance';
import {
  BASE_CHECK,
  GEOMETRY_LOCK,
  checkFor,
  formatPrompt,
  materialsBlock,
  profileLight,
  targetedRequest,
} from './render-profiles';

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

const IMPROVE_ONLY =
  'Improve only the following, without letting one improvement cancel another protection:';

export function buildEnhancePrompt(input: {
  engine: EngineName;
  options: readonly EnhanceOptionKey[];
  strength: EnhanceStrength;
  /** Lumière's sub-option; ignored unless Lumière is ticked. */
  darkRoom?: boolean | undefined;
  /** The profile « Ambiance » harmonises towards; required with it. */
  ambiance?: EnhanceAmbianceKey | undefined;
  instruction?: string | undefined;
}): string {
  const request = targetedRequest(input.instruction);
  // Fixed order regardless of click order, and each option once — the prompt
  // for a given set of ticks is always the same string.
  const picked = ENHANCE_OPTION_KEYS.filter((k) => input.options.includes(k));
  const lines: string[] = [];
  for (const k of picked) {
    lines.push(ENHANCE_LINES[k]);
    if (k === 'lighting' && input.darkRoom) lines.push(DARK_ROOM_LINE);
    if (k === 'ambiance' && input.ambiance) {
      lines.push(
        `Lighting guidance of the selected profile: ${profileLight(input.ambiance).visio}`,
      );
    }
  }
  const sections = [];
  if (lines.length > 0) {
    sections.push({
      title: 'IMPROVEMENTS',
      visio: [IMPROVE_ONLY, ...lines].join('\n'),
      pixel: lines.map((l) => `- ${l}`),
    });
  }
  const strength = STRENGTH_LINES[input.strength];
  sections.push(
    { title: 'INTENSITY', visio: strength, pixel: [strength] },
    {
      title: 'MATERIALS',
      visio: materialsBlock(request !== null),
      pixel: [materialsBlock(request !== null)],
    },
  );
  return formatPrompt(input.engine, {
    kind: 'edit',
    lock: GEOMETRY_LOCK,
    request: request ? [request] : [],
    sections,
    avoid: 'HDR look, oversaturation, oversharpening, new objects',
    check: checkFor(BASE_CHECK, request !== null),
  });
}
