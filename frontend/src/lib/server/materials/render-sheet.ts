// The materials sheet of an image and its public code (2026-10-19, owner).
//
// - Every image has a code (« RP-7K4M2Q »), unique on the whole site, so that
//   pasting it back names exactly one image. It is assigned the first time
//   the image is shown or a sheet is made for it (`ensureNodeCode`), never
//   twice: the column is unique and the update only fills a NULL.
// - A render gets a sheet right after it is made: which colour of its source
//   became which material, the ambiance used, the source's code. The sheet is
//   first stored as "pending" with the request (the panel says the analysis
//   is running), then completed once the response is gone (`after`), by the
//   vision model of ai/vision-sheet.ts. No key, a refusal, an unreadable
//   answer: the sheet says so and the render is untouched.
// - A sheet pasted under the prompt is read back (`resolvePastedSheet`): the
//   code, when it names one of the user's own images that has a sheet, is the
//   authority; otherwise the pasted lines are.
import 'server-only';
import { randomInt } from 'node:crypto';
import { after } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { log } from '@/lib/server/observability/log';
import { analyzeRenderSheet, sheetAnalysisConfigured } from '@/lib/server/ai/vision-sheet';
import { debitCredits, type DebitResult } from '@/lib/server/generation/tier-quota';
import { SHEET_COST } from '@/lib/pricing-tiers';
import {
  CODE_ALPHABET,
  IMAGE_CODE_RE,
  MAX_SHEET_FIELD,
  MAX_SHEET_LINES,
  extractSheetBlock,
  type SheetLine,
} from '@/lib/render-sheet';
import { toPromptLine } from '@/lib/server/generation/render-profiles';
import { requestLocale } from '@/lib/i18n/request-locale';

export type SheetStatus = 'idle' | 'pending' | 'ready' | 'unavailable' | 'failed';

export interface StoredSheet {
  v: 1;
  status: SheetStatus;
  lines: SheetLine[];
  /** The ambiance the render was made with (and Exterior day's sky). */
  ambiance: { key: string; sky: 'hazy' | 'sun' | null } | null;
  /** The code of the source image the render came from. */
  sourceCode: string | null;
  /** Why an analysis did not produce a sheet (a short code, never a message). */
  failure?: string;
  /** When the paid analysis started (ms): a pending sheet older than STALL_MS is given up. */
  startedAt?: number;
}

export function generateImageCode(): string {
  let body = '';
  for (let i = 0; i < 6; i++) body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `RP-${body}`;
}

/** The image's code, given now if it had none. */
export async function ensureNodeCode(nodeId: string): Promise<string> {
  const node = await prisma.renderNode.findUnique({
    where: { id: nodeId },
    select: { code: true },
  });
  if (node?.code) return node.code;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateImageCode();
    try {
      // Only fills a NULL: two requests racing keep the first one's code.
      const { count } = await prisma.renderNode.updateMany({
        where: { id: nodeId, code: null },
        data: { code },
      });
      if (count === 1) return code;
      const again = await prisma.renderNode.findUnique({
        where: { id: nodeId },
        select: { code: true },
      });
      if (again?.code) return again.code;
    } catch (err) {
      // A code already taken by another image (unique index): draw again.
      if (!(typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002')) {
        throw err;
      }
    }
  }
  throw new Error('could not give the image a code');
}

/** What the database holds, read defensively (it is JSON). */
export function readSheet(value: unknown): StoredSheet | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<StoredSheet>;
  if (v.v !== 1 || !v.status) return null;
  const lines = Array.isArray(v.lines)
    ? v.lines
        .filter(
          (l): l is SheetLine =>
            typeof l === 'object' &&
            l !== null &&
            typeof l.color === 'string' &&
            typeof l.material === 'string',
        )
        .slice(0, MAX_SHEET_LINES)
    : [];
  return {
    v: 1,
    status: v.status,
    lines,
    ambiance: v.ambiance && typeof v.ambiance.key === 'string' ? v.ambiance : null,
    sourceCode: typeof v.sourceCode === 'string' ? v.sourceCode : null,
    ...(typeof v.failure === 'string' ? { failure: v.failure.slice(0, 40) } : {}),
    ...(typeof v.startedAt === 'number' ? { startedAt: v.startedAt } : {}),
  };
}

/** The render has just been stored: its sheet starts, "idle" — the analysis only runs when the user copies the sheet (and pays for it). */
export async function startSheet(input: {
  nodeId: string;
  sourceNodeId: string;
  ambiance: { key: string; sky: 'hazy' | 'sun' | null } | null;
}): Promise<void> {
  const [, sourceCode] = await Promise.all([
    ensureNodeCode(input.nodeId),
    ensureNodeCode(input.sourceNodeId),
  ]);
  const sheet: StoredSheet = {
    v: 1,
    status: 'idle',
    lines: [],
    ambiance: input.ambiance,
    sourceCode,
  };
  await prisma.renderNode.update({
    where: { id: input.nodeId },
    data: { sheet: sheet as unknown as Prisma.InputJsonObject },
  });
}

/** Runs once the response is sent (Next's `after`), or at once without a request. */
export function runAfterResponse(task: () => Promise<void>): void {
  const guarded = () =>
    task().catch((err: unknown) => log.warn('sheet: task failed', { err: String(err) }));
  try {
    after(guarded);
  } catch {
    // No request scope (a script, a test): run it, not awaited.
    void guarded();
  }
}

/**
 * The analysis of the render against its source. It writes the lines when it
 * has them; when it has none it only says why — ending the paid request (the
 * "failed" sheet and the refund, together) is failAndRefund's job.
 */
export async function completeSheet(input: {
  nodeId: string;
  source: Buffer;
  render: Buffer;
  locale: 'fr' | 'en';
}): Promise<{ ok: true } | { ok: false; failure: string }> {
  const node = await prisma.renderNode.findUnique({
    where: { id: input.nodeId },
    select: { sheet: true },
  });
  const current = readSheet(node?.sheet);
  if (!current) return { ok: false, failure: 'no_sheet' };
  const answer = await analyzeRenderSheet({
    source: input.source,
    render: input.render,
    locale: input.locale,
  });
  if (answer.kind !== 'lines') {
    return {
      ok: false,
      failure:
        answer.kind === 'error'
          ? `${answer.code}${answer.status ? `_${answer.status}` : ''}`
          : answer.kind,
    };
  }
  const ready: StoredSheet = { ...current, status: 'ready', lines: answer.lines };
  delete ready.failure;
  await prisma.renderNode.update({
    where: { id: input.nodeId },
    data: { sheet: ready as unknown as Prisma.InputJsonObject },
  });
  return { ok: true };
}

/**
 * Ends a paid analysis that produced nothing: the sheet turns "failed" and the
 * credits go back in ONE transaction, and only while the sheet is still
 * "pending" — so they come back exactly once, never twice and never not at
 * all (2026-10-19, owner: « si ça n'a pas marché, tu ne me prélèves rien »).
 */
export async function failAndRefund(
  nodeId: string,
  userId: string,
  failure: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const node = await tx.renderNode.findUnique({ where: { id: nodeId }, select: { sheet: true } });
    const current = readSheet(node?.sheet);
    if (!current || current.status !== 'pending') return false;
    const { count } = await tx.renderNode.updateMany({
      where: { id: nodeId, sheet: { path: ['status'], equals: 'pending' } },
      data: {
        sheet: { ...current, status: 'failed', failure } as unknown as Prisma.InputJsonObject,
      },
    });
    if (count !== 1) return false;
    await tx.user.update({
      where: { id: userId },
      data: { creditsBalance: { increment: SHEET_COST } },
    });
    return true;
  });
}

/** A paid analysis still "pending" after this long was cut off with its task. */
export const STALL_MS = 4 * 60_000;

/**
 * Called when the sheet is read: an analysis whose task died (the platform cut
 * it) is given up and refunded, so credits are never left taken for nothing.
 * Returns the sheet as it should be shown.
 */
export async function recoverStalledSheet(
  nodeId: string,
  userId: string,
  stored: unknown,
): Promise<unknown> {
  const sheet = readSheet(stored);
  if (
    !sheet ||
    sheet.status !== 'pending' ||
    typeof sheet.startedAt !== 'number' ||
    Date.now() - sheet.startedAt < STALL_MS
  ) {
    return stored;
  }
  try {
    await failAndRefund(nodeId, userId, 'stalled');
  } catch (err) {
    log.warn('sheet: could not give up a stalled analysis', { err: String(err) });
    return stored;
  }
  const again = await prisma.renderNode.findUnique({
    where: { id: nodeId },
    select: { sheet: true },
  });
  return again?.sheet ?? stored;
}

/** One line of a sheet, as one line of prompt (see toPromptLine). */
const oneLine = (s: string) => toPromptLine(s).slice(0, MAX_SHEET_FIELD);

export interface PastedSheet {
  code: string | null;
  sourceCode: string | null;
  ambianceKey: string | null;
  sky: 'hazy' | 'sun' | null;
  lines: SheetLine[];
}

/**
 * A sheet pasted in the prompt: takes it out of the text and returns it with
 * the text that is left. When its code names one of THIS user's images that
 * has a ready sheet, that sheet is the authority (the lines, the ambiance);
 * a code that is unknown, another user's or without a sheet falls back to what
 * was pasted. Lines are flattened to one line each, whatever was typed.
 */
export async function resolvePastedSheet(
  text: string | undefined,
  userId: string,
): Promise<{ sheet: PastedSheet | null; rest: string | undefined }> {
  if (!text) return { sheet: null, rest: text };
  const found = extractSheetBlock(text);
  if (!found) return { sheet: null, rest: text };
  const { sheet: block, rest } = found;
  const sheet: PastedSheet = {
    code: block.code && IMAGE_CODE_RE.test(block.code) ? block.code : null,
    sourceCode: block.sourceCode,
    ambianceKey: block.ambianceKey,
    sky: block.sky,
    lines: block.lines.map((l) => ({ color: oneLine(l.color), material: oneLine(l.material) })),
  };
  if (sheet.code) {
    const node = await prisma.renderNode.findFirst({
      where: { code: sheet.code, project: { userId } },
      select: { sheet: true },
    });
    const stored = readSheet(node?.sheet);
    if (stored?.status === 'ready' && stored.lines.length > 0) {
      sheet.lines = stored.lines.map((l) => ({
        color: oneLine(l.color),
        material: oneLine(l.material),
      }));
      sheet.ambianceKey = stored.ambiance?.key ?? sheet.ambianceKey;
      sheet.sky = stored.ambiance?.sky ?? sheet.sky;
    }
  }
  sheet.lines = sheet.lines.filter((l) => l.color !== '' && l.material !== '');
  return { sheet, rest: rest === '' ? undefined : rest };
}

/** The language the sheet is written in: the visitor's own (English off a request). */
async function sheetLocale(): Promise<'fr' | 'en'> {
  try {
    return (await requestLocale()).locale === 'fr' ? 'fr' : 'en';
  } catch {
    return 'en';
  }
}

/**
 * A render has just been stored: its sheet starts now, "idle" — no analysis
 * and no charge until the user copies the sheet (requestSheetAnalysis). Never
 * throws — a sheet that cannot start leaves the render exactly as it is.
 */
export async function scheduleSheet(input: {
  nodeId: string;
  sourceNodeId: string;
  ambiance: { key: string; sky: 'hazy' | 'sun' | null } | null;
}): Promise<void> {
  try {
    await startSheet(input);
  } catch (err) {
    log.warn('sheet: could not start (non-fatal)', { err: String(err) });
  }
}

export type SheetRequestOutcome =
  | { kind: 'not_found' }
  | { kind: 'no_sheet' }
  | { kind: 'already'; status: SheetStatus }
  | { kind: 'not_configured' }
  | { kind: 'refused'; refusal: Extract<DebitResult, { ok: false }> }
  | { kind: 'started'; balance: number };

async function fetchBuffer(url: string): Promise<Buffer | null> {
  const res = await fetch(url);
  return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

/**
 * The user copied the sheet of a render that has no analysis yet (2026-10-19,
 * owner): the analysis is asked now and SHEET_COST credits are taken — only
 * then, never before. The claim on the sheet ("pending") is one conditional
 * UPDATE, so two quick clicks pay once. The credits come back if the analysis
 * does not produce a sheet. The work runs after the response.
 */
export async function requestSheetAnalysis(input: {
  nodeId: string;
  userId: string;
}): Promise<SheetRequestOutcome> {
  const node = await prisma.renderNode.findUnique({
    where: { id: input.nodeId },
    select: {
      kind: true,
      blobUrl: true,
      sheet: true,
      parent: { select: { blobUrl: true } },
      project: { select: { userId: true } },
    },
  });
  if (!node || node.project.userId !== input.userId) return { kind: 'not_found' };
  const sheet = readSheet(node.sheet);
  if (!sheet || node.kind !== 'GENERATED' || !node.parent) return { kind: 'no_sheet' };
  if (sheet.status === 'ready' || sheet.status === 'pending') {
    return { kind: 'already', status: sheet.status };
  }
  if (!sheetAnalysisConfigured()) return { kind: 'not_configured' };

  const claimed = await prisma.renderNode.updateMany({
    where: { id: input.nodeId, sheet: { path: ['status'], equals: sheet.status } },
    data: {
      sheet: {
        ...sheet,
        status: 'pending',
        startedAt: Date.now(),
      } as unknown as Prisma.InputJsonObject,
    },
  });
  if (claimed.count === 0) return { kind: 'already', status: 'pending' };

  const restore = () =>
    prisma.renderNode.update({
      where: { id: input.nodeId },
      data: { sheet: sheet as unknown as Prisma.InputJsonObject },
    });
  const debit = await debitCredits(prisma, input.userId, SHEET_COST);
  if (!debit.ok) {
    await restore();
    return { kind: 'refused', refusal: debit };
  }

  const locale = await sheetLocale();
  const sourceUrl = node.parent.blobUrl;
  const renderUrl = node.blobUrl;
  runAfterResponse(async () => {
    let failure: string | null = 'images';
    try {
      const [source, render] = await Promise.all([fetchBuffer(sourceUrl), fetchBuffer(renderUrl)]);
      if (source && render) {
        const done = await completeSheet({ nodeId: input.nodeId, source, render, locale });
        failure = done.ok ? null : done.failure;
      }
    } catch (err) {
      log.warn('sheet: analysis task failed', { err: String(err) });
      failure = 'exception';
    }
    if (failure) await failAndRefund(input.nodeId, input.userId, failure);
  });
  return { kind: 'started', balance: debit.balance };
}
