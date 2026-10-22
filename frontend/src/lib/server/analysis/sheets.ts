// The project's memory (2026-10-22 specification, phase 2): one sheet per
// building — or per floor plan — of a project. The sheets go to Claude before
// the analysis; Claude says whether the image shows one of them
// (same_building, matched_sheet). « yes » with a sheet of this project: that
// sheet is updated with the new analysis, which already keeps its wording;
// « no » or « unsure »: a new sheet (unsure is treated as no, so a building
// never gets another's materials). The rule lives here and nowhere else.
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';

export type SheetKind = 'building' | 'plan';

/** The sections kept for the next ambiances of the same building. */
export interface StoredSections {
  site?: string;
  vegetation?: string;
  space?: string;
  styling?: string;
}

/** Améliorer: the premium finish chosen for each element. */
export type PremiumFinishes = Record<string, string>;

export interface SheetRow {
  id: string;
  analysis: Record<string, unknown>;
  sections: StoredSections | null;
  premium: PremiumFinishes | null;
}

/** Usually one to three per project; a project never sends more than this. */
const MAX_SHEETS = 5;

type Db = Pick<PrismaClient, 'buildingSheet'> | Prisma.TransactionClient;

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function strings<T extends object>(v: unknown): T | null {
  const r = asRecord(v);
  if (!r) return null;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(r)) if (typeof val === 'string' && val) out[k] = val;
  return Object.keys(out).length > 0 ? (out as T) : null;
}

export async function loadSheets(db: Db, projectId: string, kind: SheetKind): Promise<SheetRow[]> {
  const rows = await db.buildingSheet.findMany({
    where: { projectId, kind },
    orderBy: { updatedAt: 'desc' },
    take: MAX_SHEETS,
    select: { id: true, analysis: true, sections: true, premium: true },
  });
  return rows.map((r) => ({
    id: r.id,
    analysis: asRecord(r.analysis) ?? {},
    sections: strings<StoredSections>(r.sections),
    premium: strings<PremiumFinishes>(r.premium),
  }));
}

/** An analysis without its « look » and its bookkeeping fields. */
export function withoutBookkeeping(analysis: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(analysis)) {
    if (!['look', 'status', 'same_building', 'matched_sheet', 'changes_vs_sheet'].includes(k)) {
      out[k] = v;
    }
  }
  return out;
}

/** What Claude is shown of each sheet: its id and its analysis, without the
 *  bulky « look » and the bookkeeping fields; Améliorer also gets the
 *  premium finishes to reuse. */
export function sheetsForPrompt(rows: readonly SheetRow[], withPremium = false): unknown[] {
  return rows.map((r) => {
    const rest = withoutBookkeeping(r.analysis);
    return {
      id: r.id,
      ...rest,
      ...(withPremium && r.premium ? { premium_finish: r.premium } : {}),
    };
  });
}

/** The sheet the analysis recognised, or null (no, unsure, or an id that is
 *  not one of this project's sheets). */
export function matchedSheet(
  rows: readonly SheetRow[],
  analysis: { same_building: string; matched_sheet: string | null },
): SheetRow | null {
  if (analysis.same_building !== 'yes' || !analysis.matched_sheet) return null;
  return rows.find((r) => r.id === analysis.matched_sheet) ?? null;
}

/**
 * Stores the analysis: on the recognised sheet (its sections and finishes
 * kept, new ones only added where it had none), else as a new sheet.
 * Returns the sheet's id.
 */
export async function saveSheet(
  db: Db,
  input: {
    projectId: string;
    kind: SheetKind;
    matched: SheetRow | null;
    analysis: Record<string, unknown>;
    sections?: StoredSections | undefined;
    premium?: PremiumFinishes | undefined;
  },
): Promise<string> {
  const json = (v: unknown) => v as Prisma.InputJsonValue;
  if (input.matched) {
    // The stored sections are reused as they are (the writer only adds the
    // missing family); the finishes come from the new analysis, which reused
    // the sheet's own and changed only the elements whose material changed.
    const sections = { ...(input.sections ?? {}), ...(input.matched.sections ?? {}) };
    const premium = { ...(input.matched.premium ?? {}), ...(input.premium ?? {}) };
    await db.buildingSheet.update({
      where: { id: input.matched.id },
      data: {
        analysis: json(input.analysis),
        ...(Object.keys(sections).length > 0 ? { sections: json(sections) } : {}),
        ...(Object.keys(premium).length > 0 ? { premium: json(premium) } : {}),
      },
    });
    return input.matched.id;
  }
  const created = await db.buildingSheet.create({
    data: {
      projectId: input.projectId,
      kind: input.kind,
      analysis: json(input.analysis),
      ...(input.sections && Object.keys(input.sections).length > 0
        ? { sections: json(input.sections) }
        : {}),
      ...(input.premium && Object.keys(input.premium).length > 0
        ? { premium: json(input.premium) }
        : {}),
    },
    select: { id: true },
  });
  return created.id;
}
