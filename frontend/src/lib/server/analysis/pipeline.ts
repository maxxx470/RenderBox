// The analysis pipeline of a render (2026-10-22 specification, steps 2 to 6):
// the project's sheets → call 1 (the analysis) → the sheet updated → call 2
// (the sections, ambiances 1 to 6) → the final prompt, assembled by code.
// Any failure stops here and the route gives every credit back: there is no
// generic plan B.
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  isWrittenPreset,
  type PresetKey,
  type WrittenPreset,
} from '@/lib/server/generation/presets';
import type {
  EnhanceAmbianceKey,
  EnhanceOptionKey,
  EnhanceStrength,
} from '@/lib/server/generation/enhance';
import type { SkyOption } from '@/lib/server/generation/templates';
import {
  analysisPromptFor,
  analyzeImage,
  type AnalysisFailure,
  type BuildingAnalysis,
  type EnhanceAnalysis,
  type PlanAnalysis,
} from './analyze';
import { enhancePrompt, exteriorPrompt, fixedPrompt, interiorPrompt, planPrompt } from './assemble';
import { imageForClaude, type ClaudeUsage } from './claude';
import { sheetsText } from './prompts';
import {
  loadSheets,
  matchedSheet,
  saveSheet,
  sheetsForPrompt,
  type PremiumFinishes,
  type StoredSections,
} from './sheets';
import { KEPT_KEYS, familyOf, writeSections, type Sections } from './writer';

type Db = Pick<PrismaClient, 'buildingSheet'> | Prisma.TransactionClient;

/** What is kept with the generation (Generation.analysis). */
export interface AnalysisTrace {
  sheetId: string;
  matched: boolean;
  analysis: unknown;
  sections?: Sections;
  usage: ClaudeUsage[];
}

export type PipelineResult =
  | { ok: true; prompt: string; trace: AnalysisTrace }
  | { ok: false; step: 'analysis' | 'writing'; reason: AnalysisFailure };

function keptSections(preset: WrittenPreset, s: Sections): StoredSections {
  const out: StoredSections = {};
  for (const key of KEPT_KEYS[familyOf(preset)]) {
    const v = s[key];
    if (v) out[key] = v;
  }
  return out;
}

/** A render with an ambiance (Générer, the fan's templates). */
export async function prepareAmbiancePrompt(
  db: Db,
  input: {
    projectId: string;
    preset: PresetKey;
    sky?: SkyOption | undefined;
    image: Buffer;
    /** The user's own words ('' when none): they replace the defaults. */
    overrides: string;
    /** A pasted materials sheet's lines (« colour → material »). */
    materialSheet?: readonly string[] | undefined;
  },
): Promise<PipelineResult> {
  const { preset } = input;
  const plan = preset === 'plan_3d';
  const kind = plan ? 'plan' : 'building';
  const rows = await loadSheets(db, input.projectId, kind);
  const image = await imageForClaude(input.image);
  const analysisRes = await analyzeImage<BuildingAnalysis | PlanAnalysis>({
    kind,
    image,
    prompt: analysisPromptFor(kind, sheetsText(sheetsForPrompt(rows)), {
      labels: preset === 'eclate',
      access: preset === 'esquisse',
      materialSheet: input.materialSheet,
    }),
  });
  if (!analysisRes.ok) return { ok: false, step: 'analysis', reason: analysisRes.reason };
  const analysis = analysisRes.analysis;
  const matched = matchedSheet(rows, analysis);
  const usage = [analysisRes.usage];

  if (plan) {
    const sheetId = await saveSheet(db, {
      projectId: input.projectId,
      kind,
      matched,
      analysis: analysis as Record<string, unknown>,
    });
    return {
      ok: true,
      prompt: planPrompt(analysis as PlanAnalysis, input.overrides),
      trace: { sheetId, matched: matched !== null, analysis, usage },
    };
  }

  const building = analysis as BuildingAnalysis;
  if (!isWrittenPreset(preset)) {
    const sheetId = await saveSheet(db, {
      projectId: input.projectId,
      kind,
      matched,
      analysis: building,
    });
    return {
      ok: true,
      prompt: fixedPrompt(
        preset as Exclude<PresetKey, WrittenPreset | 'plan_3d'>,
        building,
        input.overrides,
      ),
      trace: { sheetId, matched: matched !== null, analysis, usage },
    };
  }

  const written = await writeSections({
    preset,
    sky: input.sky,
    analysis: building,
    overrides: input.overrides,
    stored: matched?.sections ?? null,
  });
  // The analysis is the building's memory even when the writing fails
  // (specification, step 4 comes before step 5).
  const sheetId = await saveSheet(db, {
    projectId: input.projectId,
    kind,
    matched,
    analysis: building,
    ...(written.ok ? { sections: keptSections(preset, written.sections) } : {}),
  });
  if (!written.ok) return { ok: false, step: 'writing', reason: written.reason };
  usage.push(written.usage);
  const prompt =
    preset === 'jour_int' || preset === 'nuit_int'
      ? interiorPrompt(preset, building, written.sections)
      : exteriorPrompt(preset, building, written.sections);
  return {
    ok: true,
    prompt,
    trace: { sheetId, matched: matched !== null, analysis, sections: written.sections, usage },
  };
}

/** Améliorer: the analysis chooses a premium finish per element. */
export async function prepareEnhancePrompt(
  db: Db,
  input: {
    projectId: string;
    image: Buffer;
    options: readonly EnhanceOptionKey[];
    strength: EnhanceStrength;
    darkRoom?: boolean | undefined;
    ambiance?: EnhanceAmbianceKey | undefined;
    instruction?: string | undefined;
  },
): Promise<PipelineResult> {
  const rows = await loadSheets(db, input.projectId, 'building');
  const image = await imageForClaude(input.image);
  const res = await analyzeImage<EnhanceAnalysis>({
    kind: 'enhance',
    image,
    prompt: analysisPromptFor('enhance', sheetsText(sheetsForPrompt(rows, true))),
  });
  if (!res.ok) return { ok: false, step: 'analysis', reason: res.reason };
  const analysis = res.analysis;
  const matched = matchedSheet(rows, analysis);

  const premium: PremiumFinishes = {};
  for (const e of analysis.elements) {
    if (e.premium_finish && !/^keep as is$/i.test(e.premium_finish)) {
      premium[e.element] = e.premium_finish;
    }
  }
  // Stored in the building's own shape, so the ambiances read it too.
  const asBuilding = {
    ...(matched?.analysis ?? {}),
    status: 'ok',
    type: analysis.type,
    lock_summary: analysis.lock_summary,
    materials: analysis.elements.map((e) => ({
      element: e.element,
      material: e.current_material,
      color: e.color,
    })),
    ...(analysis.look !== undefined ? { look: analysis.look } : {}),
  };
  const sheetId = await saveSheet(db, {
    projectId: input.projectId,
    kind: 'building',
    matched,
    analysis: asBuilding,
    premium,
  });
  return {
    ok: true,
    prompt: enhancePrompt({
      analysis,
      options: input.options,
      strength: input.strength,
      darkRoom: input.darkRoom,
      ambiance: input.ambiance,
      instruction: input.instruction,
    }),
    trace: { sheetId, matched: matched !== null, analysis, usage: [res.usage] },
  };
}
