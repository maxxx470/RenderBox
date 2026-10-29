// The one server-side source of the rendering prompts (2026-10-19, owner's
// "Audit puis amélioration des prompts de rendu IA", decisions D1–D8).
//
// Every prompt is a PromptSpec — the same blocks, the same constraints — that
// formatPrompt() lays out for the engine that will read it:
// - Visio (Nano Banana): fluent, concise prose, in a photographer's words;
// - Pixel IA (GPT Image): numbered sections, every figure on its own line,
//   then a FINAL CHECK.
// The formatting never drops a constraint: both layouts print the same lock,
// the same request, the same sections and the same "avoid" list (a test walks
// them). The source image is always named as such ("the provided image" /
// "the first image"), and GEOMETRY_LOCK always comes first, before the light.
//
// The blocks are English on purpose: only interface labels are translated,
// never the technical values nor the prompt text.
//
// `server-only`: the browser receives keys and labels (presets.ts,
// templates.ts, enhance.ts), never these texts.
import 'server-only';
import type { EngineName } from './engines/types';
import type { SkyOption } from './templates';
import type { Locale } from '@/lib/i18n/dictionaries';

// ── Common blocks ─────────────────────────────────────────────────────────

/** Always first. Verbatim from the specification, section 5. */
export const GEOMETRY_LOCK =
  'Preserve the exact geometry, proportions, openings, roof shape, camera angle, framing and perspective of the source image. Keep vertical lines straight. Do not add, remove, move, resize or redesign any architectural element, furniture or object unless explicitly instructed. If part of the building is blurry, hidden or cut off, do not invent distinctive features: no new window, no new roof shape, no new volume.';

/**
 * The lock of the modules that change the KIND of picture (a 3D plan, an
 * exploded view, a model, an access diagram): the view itself changes, so
 * the camera clause would contradict the module; the building's footprint,
 * volumes and openings may not. Furniture and figures are left to the module
 * (the 3D plan furnishes, the model has figures) — its explicit exception.
 */
export const TRANSFORM_LOCK =
  "Keep the building's real footprint, volumes, proportions, roof shape and the number and position of its openings; only the kind of representation changes, as described below. Do not add, remove, move, resize or redesign any architectural element unless explicitly instructed. If part of the building is blurry, hidden or cut off, do not invent distinctive features: no new window, no new roof shape, no new volume.";

/** Annex B, verbatim. */
export const MATERIALS_BLOCK =
  'Keep every material, color, finish and pattern exactly as in the source image. Do not replace, restyle, recolor or reinterpret any material. Only render each existing material more realistically, with physically accurate response to light. Where such materials are present: lime plaster, render and polished concrete with subtle tonal variation, fine grain and micro-patina, never a uniform plastic surface; wood with visible grain and soft satin reflection; fabric, linen and bouclé with visible weave, natural wrinkles and soft shadow in the folds; marble, travertine and stone with sharp veining, soft reflection and fine regular joints; tiles and zellige with glaze variation, small tone differences and visible joints; glass with believable reflections of sky and surroundings, a slight green or blue tint, never a perfect mirror; metal with sharp controlled reflections and a light patina; brick with brick-to-brick color variation and recessed joints; vegetation with varied foliage and natural green, never a uniform mass or neon green. Add subtle imperfections for a lived-in realism. No excessive gloss, no plastic or smooth-3D look. The same material keeps the same appearance on every face within a view.';

/**
 * MATERIALS_BLOCK when the user asked for a change: its first two sentences
 * would otherwise forbid the very change asked for (« façade en bois »), and
 * the engine would have to arbitrate. The contradiction is settled here.
 */
const MATERIALS_BLOCK_WITH_REQUEST = MATERIALS_BLOCK.replace(
  'Keep every material, color, finish and pattern exactly as in the source image. Do not replace, restyle, recolor or reinterpret any material.',
  'Apart from what the request above explicitly names, keep every material, color, finish and pattern exactly as in the source image, and do not replace, restyle, recolor or reinterpret any other material.',
);

/** Annex A, verbatim. Photo profiles only — never on a drawing. */
export const PHOTO_LOOK =
  'High-end architectural photography, full-frame camera, 35 mm lens, natural exposure, subtle depth of field, fine film grain, no oversharpening, photorealistic.';

/** Above the source image's recorded materials, when it has any. */
export const PROJECT_MATERIALS_HEADER =
  'Recorded materials of this source image (keep each one unless the request explicitly changes it):';

// Every character a model may read as a line break — LF, CR (alone or in
// CRLF), vertical tab, form feed, NEL, LINE SEPARATOR, PARAGRAPH SEPARATOR —
// with the spaces or tabs around it; a run of them counts as one.
const LINE_BREAKS = /[\t ]*(?:[\n\r\v\f\u0085\u2028\u2029][\t ]*)+/g;

/** Text as one line of prompt: each run of line breaks becomes one space, ends trimmed. */
export function toPromptLine(text: string): string {
  return text.replace(LINE_BREAKS, ' ').trim();
}

/**
 * The user's own words, when there are any (D5: a rule, no clarification
 * screen). Flattened to one line, so nothing typed can pose as a section.
 */
export function targetedRequest(request: string | undefined): string | null {
  const line = request ? toPromptLine(request) : '';
  if (!line) return null;
  return `Only modify what this request explicitly names: "${line}". Everything else must remain faithful to the source image. Words such as improve, modernise or make it nicer are not permission to change the design.`;
}

export function materialsBlock(hasRequest: boolean): string {
  return hasRequest ? MATERIALS_BLOCK_WITH_REQUEST : MATERIALS_BLOCK;
}

/** "- face: value" lines; a blank face or value says nothing and is left out. */
export function projectMaterialLines(
  materials: readonly { face: string; valeur: string }[],
): string[] {
  const lines = materials
    .map((m) => ({ face: toPromptLine(m.face), valeur: toPromptLine(m.valeur) }))
    .filter((m) => m.face !== '' && m.valeur !== '')
    .map((m) => `- ${m.face}: ${m.valeur}`);
  return lines.length > 0 ? [PROJECT_MATERIALS_HEADER, ...lines] : [];
}

// ── Profiles (annex A) ────────────────────────────────────────────────────

export const PROFILE_KEYS = ['jour_ext', 'jour_int', 'nuit_ext', 'nuit_int'] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];

export function isProfileKey(value: string): value is ProfileKey {
  return (PROFILE_KEYS as readonly string[]).includes(value);
}

/**
 * The annex A wording of the four profiles (with the palette sentences), kept
 * for what still reads them: Améliorer's « Ambiance » improvement. The
 * ambiances of Générer use the owner's specification (spec-prompts.ts).
 */
const PROFILE_TEXT = {
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
} as const;

export type SkyKey = SkyOption;

interface Light {
  /** One paragraph, figure + plain words, for Visio. */
  visio: string;
  /** One line per value, for Pixel IA. */
  pixel: readonly string[];
  avoid: string;
}

function exteriorDay(sky: SkyKey): Light {
  const hazy = sky === 'hazy';
  return {
    visio: hazy ? PROFILE_TEXT.EXTERIOR_DAY_HAZY : PROFILE_TEXT.EXTERIOR_DAY_SUN,
    pixel: [
      hazy
        ? '- Sky: lightly hazy, sun at 30 to 45 degrees elevation.'
        : '- Sky: direct sun at 30 to 45 degrees elevation, clear sky.',
      '- White balance: neutral, around 5600 K.',
      '- Exposure: 0 to +0.3 EV (target +0.1 EV), facade never overexposed.',
      '- Contrast: medium, filmic.',
      '- Saturation: -5 to 0 percent (target -3 percent); vegetation natural green, never neon.',
      hazy ? '- Shadows: defined but softened.' : '- Shadows: crisp but softened.',
      hazy
        ? '- Palette: a pale clean blue sky, softly cool shadows, fresh natural greens.'
        : '- Palette: a deep clean blue sky, crisp cool shadows, fresh natural greens.',
    ],
    avoid:
      'oversaturated sky, black shadows, neon green vegetation, blown white walls, HDR look, fake lens flare',
  };
}

const LIGHTS: Record<Exclude<ProfileKey, 'jour_ext'>, Light> = {
  jour_int: {
    visio: PROFILE_TEXT.INTERIOR_DAY,
    pixel: [
      '- Source: soft diffused daylight through the windows, like an overcast sky, filtered by blinds or curtains.',
      '- White balance: neutral slightly warm, around 4800 K; practical lamps as small accents around 2700 K.',
      '- Exposure: -0.3 to 0 EV (target -0.15 EV); open shadows; window view keeps detail, no blown-out windows.',
      '- Contrast: soft filmic, slightly lifted blacks.',
      '- Saturation: lowered by 10 to 15 percent (target -12 percent); a few accent colors stay readable.',
      '- Shadows: long and soft, never hard; realistic global illumination with gentle warm bounce.',
      '- Palette: warm cream, sand and oat tones in soft white light.',
    ],
    avoid:
      'blown highlights, crushed blacks, oversaturation, orange cast, harsh sun patches, HDR look, plastic surfaces',
  },
  nuit_ext: {
    visio: PROFILE_TEXT.EXTERIOR_NIGHT,
    pixel: [
      '- Time: blue hour, deep blue sky, never flat black.',
      '- Artificial light: architectural facade lighting around 2800 K, warm glowing windows, controlled glow, soft falloff.',
      '- Exposure: -0.7 to -0.3 EV (target -0.5 EV).',
      '- Contrast: medium-high, filmic.',
      '- Saturation: 0 to +5 percent (target +3 percent).',
      '- Ground: slightly reflective.',
      '- Palette: deep indigo and teal sky and shadows against warm amber windows.',
    ],
    avoid: 'flat black sky, excessive halos, overexposed lamps, grain noise, oversaturated blue',
  },
  nuit_int: {
    visio: PROFILE_TEXT.INTERIOR_NIGHT,
    pixel: [
      '- Lamps: practical and indirect lighting around 2700 K, subtle warm spot accents, warm pools of light with soft falloff.',
      '- Windows: deep blue night, around 7500 K.',
      '- Exposure: -0.3 to 0 EV (target -0.15 EV); the room stays readable, never black.',
      '- Contrast: medium-high, shadows still detailed.',
      '- Saturation: about -5 percent.',
      '- Realistic global illumination.',
      '- Palette: deep bronze, chocolate brown and near-black against warm amber light.',
    ],
    avoid: 'room too dark, burnt lamp highlights, flat lighting, overall orange cast, noise',
  },
};

export function profileLight(profile: ProfileKey, sky: SkyKey = 'hazy'): Light {
  return profile === 'jour_ext' ? exteriorDay(sky) : LIGHTS[profile];
}

/** C0, no ambiance: the source's own light, corrected only where needed. */
const SOURCE_LIGHT: Light = {
  visio:
    "Keep the source's own light direction, time of day and color balance; correct exposure and white balance only where needed. Do not add an ambiance: no sunset, no cinematic or artistic look.",
  pixel: [
    "- Keep the source's light direction, time of day and color balance.",
    '- Correct exposure and white balance only where needed.',
    '- No new ambiance: no sunset, no cinematic or artistic look.',
  ],
  avoid: 'HDR look, oversaturation, blown highlights, crushed blacks, plastic surfaces',
};

// ── Spec and layouts ──────────────────────────────────────────────────────

export interface PromptSection {
  /** Pixel IA's section title (uppercase). */
  title: string;
  /** Visio's prose. */
  visio: string;
  /** Pixel IA's lines. */
  pixel: readonly string[];
}

export interface PromptSpec {
  /** An edit of the image (same view) or a new kind of picture of it. */
  kind: 'edit' | 'transform';
  lock: string;
  /** Lines right after the lock: the user's request, the element to add… */
  request: readonly string[];
  sections: readonly PromptSection[];
  /** Comma-separated, lower case; none for the comment edits. */
  avoid?: string;
  /** Pixel IA's FINAL CHECK, after "Before answering, verify: ". */
  check: string;
  /**
   * Lines sent LAST on both engines, after everything else — the final check
   * included. Empty on every prompt that has no reference image, so the
   * frozen prompts are untouched.
   *
   * It exists for the reference-image lock (2026-10-29): a constraint the
   * engine must not trade away has to be the last thing it reads, and Visio's
   * layout has no final-check block to put it in.
   */
  tail?: readonly string[];
}

const INTRO: Record<PromptSpec['kind'], { visio: string; pixel: string }> = {
  edit: {
    visio: 'This is an edit of the provided image, not a new design.',
    pixel: 'This is an edit of the first image, not a new design.',
  },
  transform: {
    visio: 'This is a new representation of the building in the provided image, not a new design.',
    pixel: 'This is a new representation of the building in the first image, not a new design.',
  },
};

export const BASE_CHECK =
  'geometry unchanged, openings unchanged, materials unchanged, no new objects';

/** With a request, the check says the request is the one exception. */
export function checkFor(base: string, hasRequest: boolean): string {
  return hasRequest ? `${base}, except what the request explicitly names` : base;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The final text one engine receives. */
export function formatPrompt(engine: EngineName, spec: PromptSpec): string {
  if (engine === 'nanobanana') {
    return [
      INTRO[spec.kind].visio,
      spec.lock,
      ...spec.request,
      ...spec.sections.map((s) => s.visio).filter((s) => s !== ''),
      ...(spec.avoid ? [`Avoid: ${spec.avoid}.`] : []),
      ...(spec.tail ?? []),
    ].join('\n');
  }
  const blocks: string[][] = [[INTRO[spec.kind].pixel, spec.lock, ...spec.request]];
  const titles = ['LOCK'];
  for (const s of spec.sections) {
    if (s.pixel.length === 0) continue;
    titles.push(s.title);
    blocks.push([...s.pixel]);
  }
  if (spec.avoid) {
    titles.push('AVOID');
    blocks.push([`${capitalise(spec.avoid)}.`]);
  }
  titles.push('FINAL CHECK');
  blocks.push([`Before answering, verify: ${spec.check}.`]);
  const numbered = blocks
    .map((lines, i) => [`${i + 1}. ${titles[i]}`, ...lines].join('\n'))
    .join('\n');
  return spec.tail?.length ? [numbered, ...spec.tail].join('\n') : numbered;
}

export function referenceIntro(count: number, locale: Locale): string[] {
  if (count < 1) return [];
  // WHICH IMAGE IS WHICH (2026-10-29, owner: « le toit a changé de géométrie
  // à cause de l'image de référence »). The engine is handed several images
  // in one call — the source first, then the references (engines/kie.ts) —
  // and until now the prompt said « besides the source image » without ever
  // saying WHICH of them was the source. With nothing to go on but order, the
  // model blends: it redrew the roof of the sketch to match the reference.
  // Numbering them is the fix, and it costs one sentence.
  const others =
    count === 1
      ? { fr: 'L’image 2 est une image de référence.', en: 'Image 2 is a reference image.' }
      : {
          fr: `Les images 2 à ${count + 1} sont des images de référence.`,
          en: `Images 2 to ${count + 1} are reference images.`,
        };
  return [
    locale === 'fr'
      ? `L’image 1 est l’IMAGE SOURCE : c’est elle, et elle seule, que vous rendez. ${others.fr} Ce sont des photographies d’AUTRES bâtiments, fournies uniquement pour inspiration. Reprenez-en les matériaux, la végétation et le ciel, et appliquez-les à l’image 1.`
      : `Image 1 is the SOURCE IMAGE: it is the one, and the only one, you render. ${others.en} They are photographs of OTHER buildings, supplied for inspiration only. Take their materials, their vegetation and their sky, and apply them to image 1.`,
  ];
}

/**
 * The geometry lock that answers the references — sent LAST, after everything
 * else including the user's own request.
 *
 * Position is the point. The lock used to sit in the middle of the prompt and
 * the last thing the engine read was the user's request, so « make the façade
 * timber » arrived long after « keep the roof ». A constraint an engine must
 * not trade away is the constraint it reads last.
 */
export function referenceLock(count: number, locale: Locale): string[] {
  if (count < 1) return [];
  return [
    locale === 'fr'
      ? `RÈGLE ABSOLUE SUR LES IMAGES DE RÉFÉRENCE : ne reprenez d’elles RIEN qui touche à la forme. Ni leur géométrie, ni leurs volumes, ni leur toiture ou la pente de leur toit, ni leurs ouvertures, ni leur nombre d’étages, ni leur cadrage, ni leur point de vue. La forme du bâtiment rendu est EXACTEMENT celle de l’image 1, jusqu’au moindre pan de toiture. Une référence ne donne que de la matière, de la végétation et du ciel.`
      : `ABSOLUTE RULE ON THE REFERENCE IMAGES: take NOTHING from them that concerns shape. Not their geometry, not their volumes, not their roof or its pitch, not their openings, not their number of floors, not their framing, not their viewpoint. The shape of the rendered building is EXACTLY that of image 1, down to every roof plane. A reference gives material, vegetation and sky, and nothing else.`,
  ];
}

// ── C0: no ambiance ───────────────────────────────────────────────────────

/**
 * Générer without an ambiance (C0, a faithful photo render): lock, request,
 * the source's own light, materials, photo look, avoid, check — in that
 * order, each block once.
 */
export function lookSpec(input: {
  request?: string | undefined;
  materials: readonly { face: string; valeur: string }[];
  /** Reference images handed to the engine with the source (2026-10-29). */
  referenceCount?: number | undefined;
}): PromptSpec {
  const request = targetedRequest(input.request);
  const hasRequest = request !== null;
  const project = projectMaterialLines(input.materials);
  const block = materialsBlock(hasRequest);
  // Without an ambiance, the references were not mentioned to the engine AT
  // ALL until 2026-10-29: it was handed two images and told nothing about the
  // second one, which is the likeliest way a reference ended up reshaping a
  // roof. C0 is written in English like the rest of this file.
  const refs = input.referenceCount ?? 0;
  const intro = referenceIntro(refs, 'en');
  return {
    kind: 'edit',
    lock: GEOMETRY_LOCK,
    request: request ? [request] : [],
    ...(refs > 0 ? { tail: referenceLock(refs, 'en') } : {}),
    sections: [
      ...(intro.length > 0
        ? [{ title: 'REFERENCE IMAGES', visio: intro.join(' '), pixel: intro }]
        : []),
      {
        title: 'LIGHT',
        visio: `Light: ${SOURCE_LIGHT.visio.charAt(0).toLowerCase()}${SOURCE_LIGHT.visio.slice(1)}`,
        pixel: SOURCE_LIGHT.pixel,
      },
      { title: 'MATERIALS', visio: [block, ...project].join('\n'), pixel: [block, ...project] },
      { title: 'PHOTO LOOK', visio: PHOTO_LOOK, pixel: [PHOTO_LOOK] },
    ],
    avoid: SOURCE_LIGHT.avoid,
    check: checkFor(BASE_CHECK, hasRequest),
  };
}
