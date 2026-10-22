// Call 2 of the analysis pipeline (2026-10-22 specification, phase 3), for
// ambiances 1 to 6 only: Claude writes three short sections in physical
// detail; everything else of the prompt is written by code (assemble.ts).
// The code then checks them — valid JSON, the three keys, under 60 words
// each, no excluded plant unless the user asked for it — and on a failure
// asks once more, then stops the render. Sections already stored for this
// building (site and vegetation, or space and styling) are reused as they
// are: only the light is written again, so the same building keeps its
// neighbours and plants in every ambiance.
import 'server-only';
import { toPromptLine } from '@/lib/server/generation/render-profiles';
import type { WrittenPreset } from '@/lib/server/generation/presets';
import type { SkyOption } from '@/lib/server/generation/templates';
import { ambianceWeather } from '@/lib/server/generation/ambiance-text';
import {
  AMBIANCE_DEFAULTS,
  DEFAULT_FLORA,
  DEFAULT_REGION,
  EXCLUDED_PLANTS,
  INTERIOR_GREENERY,
  LOOK_WRITER_ADDON,
  exteriorWriterPrompt,
  interiorWriterPrompt,
} from './prompts';
import { WRITER_MODEL, askClaude, parseJsonObject, type ClaudeUsage } from './claude';
import type { StoredSections } from './sheets';

/** One attempt of call 2 (a short text answer). */
export const WRITER_ATTEMPT_MS = 20_000;
/** The specification's check: « chaque section fait moins de 60 mots ». */
export const MAX_SECTION_WORDS = 60;

export type Family = 'exterior' | 'interior';

export const FAMILY_KEYS = {
  exterior: ['site', 'lighting', 'vegetation'],
  interior: ['space', 'lighting', 'styling'],
} as const;

/** The two sections a building keeps from one ambiance to the next. */
export const KEPT_KEYS = {
  exterior: ['site', 'vegetation'],
  interior: ['space', 'styling'],
} as const;

export type Sections = Record<string, string>;

export function familyOf(preset: WrittenPreset): Family {
  return preset === 'jour_int' || preset === 'nuit_int' ? 'interior' : 'exterior';
}

/** The defaults the writer starts from (specification, « Valeurs par défaut »). */
export function writerDefaults(preset: WrittenPreset, sky: SkyOption | undefined) {
  const d = AMBIANCE_DEFAULTS[preset];
  const weather = ambianceWeather(preset, sky);
  return familyOf(preset) === 'exterior'
    ? { default_region: DEFAULT_REGION, default_flora: DEFAULT_FLORA, ...d, weather }
    : {
        default_region: DEFAULT_REGION,
        default_flora: DEFAULT_FLORA,
        interior_greenery: INTERIOR_GREENERY,
        ...d,
      };
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** The excluded plants a text names that the user did not ask for. */
export function excludedPlantsIn(text: string, overrides: string): string[] {
  const t = text.toLowerCase();
  const asked = overrides.toLowerCase();
  return EXCLUDED_PLANTS.filter(
    (p) => p.words.some((w) => t.includes(w)) && !p.words.some((w) => asked.includes(w)),
  ).map((p) => p.name);
}

/** The sections if they pass every check, else null. */
export function checkSections(family: Family, json: unknown, overrides: string): Sections | null {
  if (typeof json !== 'object' || json === null) return null;
  const out: Sections = {};
  for (const key of FAMILY_KEYS[family]) {
    const v = (json as Record<string, unknown>)[key];
    if (typeof v !== 'string') return null;
    const line = toPromptLine(v);
    if (line === '' || words(line) >= MAX_SECTION_WORDS) return null;
    if (excludedPlantsIn(line, overrides).length > 0) return null;
    out[key] = line;
  }
  return out;
}

export async function writeSections(input: {
  preset: WrittenPreset;
  sky?: SkyOption | undefined;
  analysis: Record<string, unknown>;
  /** The user's own words; '' when none. */
  overrides: string;
  stored: StoredSections | null;
}): Promise<
  | { ok: true; sections: Sections; usage: ClaudeUsage }
  | { ok: false; reason: 'not_configured' | 'timeout' | 'failed' }
> {
  const family = familyOf(input.preset);
  const kept: Sections = {};
  for (const key of KEPT_KEYS[family]) {
    const v = input.stored?.[key];
    if (v) kept[key] = v;
  }
  const hasStored = Object.keys(kept).length === KEPT_KEYS[family].length;
  const prompt = [
    family === 'exterior'
      ? exteriorWriterPrompt(
          {
            analysis: JSON.stringify(input.analysis),
            defaults: JSON.stringify(writerDefaults(input.preset, input.sky)),
            overrides: input.overrides ? JSON.stringify(input.overrides) : 'none',
            stored: hasStored ? JSON.stringify(kept) : 'none',
          },
          input.preset === 'nuit_ext',
        )
      : interiorWriterPrompt({
          analysis: JSON.stringify(input.analysis),
          defaults: JSON.stringify(writerDefaults(input.preset, input.sky)),
          overrides: input.overrides ? JSON.stringify(input.overrides) : 'none',
          stored: hasStored ? JSON.stringify(kept) : 'none',
        }),
    '',
    LOOK_WRITER_ADDON,
  ].join('\n');

  const res = await askClaude(
    { model: WRITER_MODEL(), maxTokens: 800, text: prompt, label: `writer:${input.preset}` },
    WRITER_ATTEMPT_MS,
    (text) => checkSections(family, parseJsonObject(text), input.overrides),
  );
  if (!res.ok) {
    return {
      ok: false,
      reason:
        res.reason === 'not_configured'
          ? 'not_configured'
          : res.reason === 'timeout'
            ? 'timeout'
            : 'failed',
    };
  }
  // The stored sections win, whatever came back: only the light is new.
  return {
    ok: true,
    sections: hasStored ? { ...res.value, ...kept } : res.value,
    usage: res.usage,
  };
}
