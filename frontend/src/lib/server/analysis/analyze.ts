// Call 1 of the analysis pipeline (2026-10-22 specification, phases 1 and
// 1 bis): what Claude reads of the source image before any render. The answer
// is never trusted raw — it is checked with zod; « unreadable », a failed or
// late call (one more try) or an answer missing a required field stops the
// render: no image, every credit given back (step 3, « aucun plan B »).
import 'server-only';
import { z } from 'zod';
import { toPromptLine } from '@/lib/server/generation/render-profiles';
import {
  ACCESS_FIELD,
  LABELS_FIELD,
  LOOK_ADDON,
  analysisPrompt,
  enhanceAnalysisPrompt,
  planAnalysisPrompt,
} from './prompts';
import { ANALYSIS_MODEL, askClaude, parseJsonObject, type ClaudeUsage } from './claude';

/** One attempt of call 1 (specification: « moins de 30 secondes »). */
export const ANALYSIS_ATTEMPT_MS = 30_000;

const str = z
  .string()
  .transform((s) => toPromptLine(s))
  .catch('');
const answer = z.enum(['yes', 'no', 'unsure']).catch('no');
const sheetId = z.string().min(1).nullable().catch(null);

const Material = z.object({
  element: z.string().transform(toPromptLine).pipe(z.string().min(1)),
  material: z.string().transform(toPromptLine).pipe(z.string().min(1)),
  color: str,
});

export const BuildingAnalysisSchema = z
  .object({
    status: z.literal('ok'),
    same_building: answer,
    matched_sheet: sheetId,
    type: z.enum(['exterior', 'interior']).catch('exterior'),
    building_type: str,
    floors: z.union([z.number(), z.string()]).catch(''),
    roof: str,
    openings: z.unknown(),
    materials: z.array(Material).min(1),
    view_angle: str,
    lock_summary: z.string().transform(toPromptLine).pipe(z.string().min(1)),
    changes_vs_sheet: z.unknown().optional(),
    labels_fr: z.array(z.string().transform(toPromptLine)).optional().catch(undefined),
    access_points: z
      .array(
        z.object({
          type: str,
          location: str,
          label_fr: z.string().transform(toPromptLine).pipe(z.string().min(1)),
        }),
      )
      .optional()
      .catch(undefined),
    look: z.unknown().optional(),
  })
  .passthrough();
export type BuildingAnalysis = z.infer<typeof BuildingAnalysisSchema>;

export const PlanAnalysisSchema = z
  .object({
    status: z.literal('ok'),
    same_building: answer,
    matched_sheet: sheetId,
    rooms: z
      .array(
        z
          .object({ name: z.string().transform(toPromptLine).pipe(z.string().min(1)) })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();
export type PlanAnalysis = z.infer<typeof PlanAnalysisSchema>;

const Element = z.object({
  element: z.string().transform(toPromptLine).pipe(z.string().min(1)),
  current_material: str,
  color: str,
  quality_issue: str,
  premium_finish: str,
});

export const EnhanceAnalysisSchema = z
  .object({
    status: z.literal('ok'),
    same_building: answer,
    matched_sheet: sheetId,
    type: z.enum(['exterior', 'interior']).catch('exterior'),
    lock_summary: z.string().transform(toPromptLine).pipe(z.string().min(1)),
    elements: z.array(Element).min(1),
    changes_vs_sheet: z.unknown().optional(),
    look: z.unknown().optional(),
  })
  .passthrough();
export type EnhanceAnalysis = z.infer<typeof EnhanceAnalysisSchema>;

export type AnalysisFailure = 'unreadable' | 'not_configured' | 'timeout' | 'failed';

export type AnalysisResult<T> =
  | { ok: true; analysis: T; usage: ClaudeUsage }
  | { ok: false; reason: AnalysisFailure };

export type AnalysisKind = 'building' | 'plan' | 'enhance';

const UNREADABLE = Symbol('unreadable');

/** The prompt of call 1 for one kind of analysis. */
export function analysisPromptFor(
  kind: AnalysisKind,
  sheets: string,
  options: {
    labels?: boolean;
    access?: boolean;
    materialSheet?: readonly string[] | undefined;
  } = {},
): string {
  if (kind === 'plan') return planAnalysisPrompt(sheets);
  const base =
    kind === 'enhance'
      ? enhanceAnalysisPrompt(sheets)
      : analysisPrompt(sheets, [
          ...(options.labels ? [LABELS_FIELD] : []),
          ...(options.access ? [ACCESS_FIELD] : []),
        ]);
  // A materials sheet the user pasted (2026-10-19 feature): the user's own
  // choice of material for a colour of the image, recorded in `materials` —
  // the lock then carries it like any material the analysis read.
  const pasted =
    options.materialSheet && options.materialSheet.length > 0
      ? [
          '',
          "User material sheet (the user's own choice): wherever the image shows the colour on the left, record the material on the right for that element.",
          ...options.materialSheet,
        ]
      : [];
  return [base, ...pasted, LOOK_ADDON].join('\n');
}

function schemaFor(kind: AnalysisKind) {
  return kind === 'plan'
    ? PlanAnalysisSchema
    : kind === 'enhance'
      ? EnhanceAnalysisSchema
      : BuildingAnalysisSchema;
}

/** Reads Claude's text: the analysis, « unreadable », or null (unusable). */
export function readAnalysis<T>(kind: AnalysisKind, text: string): T | typeof UNREADABLE | null {
  const json = parseJsonObject(text);
  if (typeof json !== 'object' || json === null) return null;
  if ((json as { status?: unknown }).status === 'unreadable') return UNREADABLE;
  const parsed = schemaFor(kind).safeParse(json);
  return parsed.success ? (parsed.data as T) : null;
}

export async function analyzeImage<T>(input: {
  kind: AnalysisKind;
  /** The source image, already sized for Claude (imageForClaude). */
  image: string;
  prompt: string;
}): Promise<AnalysisResult<T>> {
  const res = await askClaude(
    {
      model: ANALYSIS_MODEL(),
      // The JSON is short; the « look » sheet and Améliorer's list of
      // elements make it longer (specification: ≈ 1 000, ≈ 2 000).
      maxTokens: input.kind === 'enhance' ? 3000 : 2000,
      image: input.image,
      text: input.prompt,
      label: `analysis:${input.kind}`,
    },
    ANALYSIS_ATTEMPT_MS,
    (text) => readAnalysis<T>(input.kind, text),
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
  if (res.value === UNREADABLE) return { ok: false, reason: 'unreadable' };
  return { ok: true, analysis: res.value as T, usage: res.usage };
}
