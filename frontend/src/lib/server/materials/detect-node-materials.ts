// Detects the materials of ONE image (RenderNode) and keeps the result on
// that image (Phase 7, materials per image). Nothing calls it yet: the
// routes will, the first time an image is used as a source.
//
// Isolation: every read and write is scoped to the node it is given. It
// never reads or writes the old project-level Material table, never touches
// MaterialCorrection, never borrows another node's detections.
//
// The image: the caller has already checked the user owns the node, and
// passes a loader for THAT node's bytes. This service never fetches a URL.
// The loader runs at most once, and only when a detection actually runs.
//
// One MaterialDetectionRun row per node:
//   - no row         never detected;
//   - "pending"      an attempt holds the claim (claimToken) since startedAt;
//   - "succeeded"    done — zero MaterialDetection rows = nothing found, and
//                    that is reused like any other result, never re-run;
//   - "failed"       the last attempt failed (errorCode, a short fixed code).
// `attempts` counts the attempts started; `finishedAt` is when the last one
// ended; `updatedAt` is maintained by Prisma.
//
// Claiming is atomic in the database, never in memory (several server
// instances): a create that loses to a concurrent create gets P2002, and a
// takeover is a compare-and-swap updateMany on the state that was read (the
// stale claim's token, or the failed attempt's startedAt and count), so two
// workers cannot both take the same run. Results are written in one
// transaction that first re-checks the claim (status "pending" + our token):
// an attempt that lost its claim writes nothing and leaves the winner's
// detections alone.
//
// Rules: a pending claim older than 90 s is considered abandoned and may be
// taken over; a failed run is retried automatically only below 3 attempts
// and 10 minutes after the last one ended; never more than one detector call
// per invocation. "Detector not configured" is not a failure: nothing is
// recorded and the next call tries again. An answer the detector could not
// read is a failure ("detector_invalid_response"), never "nothing found".
//
// Timing: the claim is not renewed. Instead an attempt has a hard 60 s
// budget from the moment it claims, for reading the image and the whole
// detector call (the SDK's own 10-minute timeout and its retries are cut by
// that deadline), then at most 15 s to save (transaction maxWait + timeout).
// So a live attempt is done before its 90 s claim can be taken over; a claim
// still pending after 90 s belongs to an attempt that was killed (function
// timeout, crash). Even then, the token check at save time keeps two
// attempts from both writing.
//
// Never throws (except on a blank node id): every outcome is a result.
import 'server-only';
import { randomUUID } from 'node:crypto';
import type { MaterialDetectionRun } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import {
  detectMaterialsDetailed,
  type VisionDetectionResult,
  type VisionErrorCode,
} from '@/lib/server/ai/vision-materials';
import { log } from '@/lib/server/observability/log';
import { canonicalizeFace } from './canonical-face';
import type { NodeMaterialDetection } from './resolve';

/** A pending claim older than this is considered abandoned. */
export const PENDING_STALE_MS = 90_000;
/** Budget of one attempt from its claim: image read + detector call. */
export const ATTEMPT_DEADLINE_MS = 60_000;
/** Bounds of the saving transaction (wait for a connection, then run). */
export const SAVE_TX_MAX_WAIT_MS = 5_000;
export const SAVE_TX_TIMEOUT_MS = 10_000;
export const FAILED_RETRY_COOLDOWN_MS = 10 * 60_000;
export const MAX_DETECTION_ATTEMPTS = 3;
export const MAX_MATERIAL_VALUE_LENGTH = 500;
/** Stored in MaterialDetectionRun.detector. */
export const DETECTOR_ID = 'vision-materials';

/** The only values ever stored in MaterialDetectionRun.errorCode. */
export type DetectionErrorCode =
  | 'detector_error'
  | 'detector_timeout'
  | 'detector_rate_limited'
  | 'detector_auth'
  | 'detector_unavailable'
  | 'detector_rejected'
  | 'detector_invalid_response'
  | 'image_unavailable'
  | 'persist_error'
  | 'db_error';

export type DetectNodeMaterialsResult =
  /** Done; `materials` may be empty (nothing found). `reused`: no detector call. */
  | { status: 'succeeded'; nodeId: string; reused: boolean; materials: NodeMaterialDetection[] }
  /** Another attempt holds a recent claim. Not a result: no materials known yet. */
  | { status: 'in_progress'; nodeId: string }
  /** Failed before, and the rules forbid an automatic retry now. */
  | {
      status: 'retry_later';
      nodeId: string;
      reason: 'cooldown' | 'max_attempts';
      /** When an automatic retry becomes possible; null = only a manual action. */
      retryAfter: Date | null;
      lastErrorCode: string | null;
    }
  /** No detector key on this server; nothing was recorded. */
  | { status: 'not_configured'; nodeId: string }
  /** This attempt failed (recorded as "failed" when it still held the claim). */
  | { status: 'failed'; nodeId: string; errorCode: DetectionErrorCode }
  /** Another attempt took the claim over; this one wrote nothing. */
  | { status: 'claim_lost'; nodeId: string };

export interface DetectNodeMaterialsInput {
  /** The source image, already validated by the caller (owner, project). */
  node: { id: string; mimeType: string };
  /** The exact bytes of that node's image. Called at most once. */
  loadImage: () => Promise<Buffer>;
}

export interface DetectNodeMaterialsDeps {
  now?: () => Date;
  newClaimToken?: () => string;
  /** Overrides ATTEMPT_DEADLINE_MS (tests). */
  attemptDeadlineMs?: number;
}

type RunStatus = 'pending' | 'succeeded' | 'failed';

interface Claim {
  token: string;
  /** The run as it was before we claimed it; null when we created it. */
  previous: MaterialDetectionRun | null;
}

type ClaimDecision =
  | { kind: 'claimed'; claim: Claim }
  | { kind: 'decided'; result: DetectNodeMaterialsResult };

function detectorConfigured(): boolean {
  // Same condition as detectMaterialsDetailed's own check (vision-materials.ts).
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function isUniqueViolation(err: unknown): boolean {
  // Duck-typed, as in notifications/index.ts.
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

/** The stored code for a detector failure (vision-materials gives fixed codes). */
export function errorCodeForVision(code: VisionErrorCode): DetectionErrorCode {
  switch (code) {
    case 'timeout':
      return 'detector_timeout';
    case 'rate_limited':
      return 'detector_rate_limited';
    case 'auth':
      return 'detector_auth';
    case 'unavailable':
      return 'detector_unavailable';
    case 'rejected':
      return 'detector_rejected';
    default:
      return 'detector_error';
  }
}

type Settled<T> = { kind: 'value'; value: T } | { kind: 'error' } | { kind: 'timeout' };

/** Waits for `work` at most `ms`; a late rejection is absorbed, never unhandled. */
async function settleWithin<T>(work: () => Promise<T>, ms: number): Promise<Settled<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settled = Promise.resolve()
    .then(work)
    .then(
      (value): Settled<T> => ({ kind: 'value', value }),
      (): Settled<T> => ({ kind: 'error' }),
    );
  const expired = new Promise<Settled<T>>((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), Math.max(0, ms));
  });
  try {
    return await Promise.race([settled, expired]);
  } finally {
    clearTimeout(timer);
  }
}

type Rejection =
  | 'empty_face'
  | 'face_too_long'
  | 'invalid_value'
  | 'invalid_confidence'
  | 'duplicate_face';

interface DetectionRow {
  nodeId: string;
  face: string;
  valeur: string;
  confidence: number;
  position: number;
}

/**
 * What the detector returned, made safe to store: canonical faces, trimmed
 * values, integer confidences 0-100, one row per face (the first one the
 * detector gave wins), positions 0..n-1 in the detector's order.
 */
export function prepareDetections(
  nodeId: string,
  detected: readonly { face: unknown; valeur: unknown; confidence: unknown }[],
): { rows: DetectionRow[]; rejected: Rejection[] } {
  const rows: DetectionRow[] = [];
  const rejected: Rejection[] = [];
  const seen = new Set<string>();
  for (const item of detected) {
    const face = canonicalizeFace(typeof item.face === 'string' ? item.face : '');
    if (!face.ok) {
      rejected.push(face.reason === 'empty' ? 'empty_face' : 'face_too_long');
      continue;
    }
    const valeur = typeof item.valeur === 'string' ? item.valeur.trim() : '';
    if (!valeur || valeur.length > MAX_MATERIAL_VALUE_LENGTH) {
      rejected.push('invalid_value');
      continue;
    }
    const confidence = item.confidence;
    if (
      typeof confidence !== 'number' ||
      !Number.isInteger(confidence) ||
      confidence < 0 ||
      confidence > 100
    ) {
      rejected.push('invalid_confidence');
      continue;
    }
    if (seen.has(face.face)) {
      rejected.push('duplicate_face');
      continue;
    }
    seen.add(face.face);
    rows.push({ nodeId, face: face.face, valeur, confidence, position: rows.length });
  }
  return { rows, rejected };
}

async function readDetections(nodeId: string): Promise<NodeMaterialDetection[]> {
  const rows = await prisma.materialDetection.findMany({
    where: { nodeId },
    orderBy: { position: 'asc' },
    select: { nodeId: true, face: true, valeur: true, confidence: true, position: true },
  });
  return rows.map((r) => ({ ...r }));
}

/** Why a failed run may not be retried now; null = it may. */
function failedRetryBlock(
  run: MaterialDetectionRun,
  at: Date,
): Extract<DetectNodeMaterialsResult, { status: 'retry_later' }> | null {
  if (run.attempts >= MAX_DETECTION_ATTEMPTS) {
    return {
      status: 'retry_later',
      nodeId: run.nodeId,
      reason: 'max_attempts',
      retryAfter: null,
      lastErrorCode: run.errorCode,
    };
  }
  const lastEnd = run.finishedAt ?? run.updatedAt;
  const retryAt = new Date(lastEnd.getTime() + FAILED_RETRY_COOLDOWN_MS);
  if (at.getTime() < retryAt.getTime()) {
    return {
      status: 'retry_later',
      nodeId: run.nodeId,
      reason: 'cooldown',
      retryAfter: retryAt,
      lastErrorCode: run.errorCode,
    };
  }
  return null;
}

/** What a run says, without trying to claim it (after losing a create race). */
async function describe(run: MaterialDetectionRun, at: Date): Promise<DetectNodeMaterialsResult> {
  const status = run.status as RunStatus;
  if (status === 'succeeded') {
    return {
      status: 'succeeded',
      nodeId: run.nodeId,
      reused: true,
      materials: await readDetections(run.nodeId),
    };
  }
  if (status === 'failed') {
    return (
      failedRetryBlock(run, at) ?? {
        status: 'retry_later',
        nodeId: run.nodeId,
        reason: 'cooldown',
        retryAfter: at,
        lastErrorCode: run.errorCode,
      }
    );
  }
  return { status: 'in_progress', nodeId: run.nodeId };
}

async function claimRun(nodeId: string, at: Date, token: string): Promise<ClaimDecision> {
  const run = await prisma.materialDetectionRun.findUnique({ where: { nodeId } });
  const decided = (result: DetectNodeMaterialsResult): ClaimDecision => ({
    kind: 'decided',
    result,
  });
  const takeover = {
    claimToken: token,
    startedAt: at,
    finishedAt: null,
    errorCode: null,
    detector: DETECTOR_ID,
    attempts: { increment: 1 },
  };

  if (!run) {
    if (!detectorConfigured()) return decided({ status: 'not_configured', nodeId });
    try {
      await prisma.materialDetectionRun.create({
        data: {
          nodeId,
          status: 'pending',
          attempts: 1,
          claimToken: token,
          detector: DETECTOR_ID,
          startedAt: at,
        },
      });
      return { kind: 'claimed', claim: { token, previous: null } };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Another request created the run between our read and our create.
      const current = await prisma.materialDetectionRun.findUnique({ where: { nodeId } });
      return decided(current ? await describe(current, at) : { status: 'in_progress', nodeId });
    }
  }

  const status = run.status as RunStatus;
  if (status === 'succeeded') return decided(await describe(run, at));

  if (status === 'pending') {
    if (at.getTime() - run.startedAt.getTime() < PENDING_STALE_MS) {
      return decided({ status: 'in_progress', nodeId });
    }
    if (run.attempts >= MAX_DETECTION_ATTEMPTS) {
      return decided({
        status: 'retry_later',
        nodeId,
        reason: 'max_attempts',
        retryAfter: null,
        lastErrorCode: run.errorCode,
      });
    }
    if (!detectorConfigured()) return decided({ status: 'not_configured', nodeId });
    // Compare-and-swap on the abandoned claim: only one taker can match it.
    const taken = await prisma.materialDetectionRun.updateMany({
      where: { nodeId, status: 'pending', claimToken: run.claimToken, startedAt: run.startedAt },
      data: takeover,
    });
    if (taken.count !== 1) return decided({ status: 'in_progress', nodeId });
    return { kind: 'claimed', claim: { token, previous: run } };
  }

  if (status === 'failed') {
    const block = failedRetryBlock(run, at);
    if (block) return decided(block);
    if (!detectorConfigured()) return decided({ status: 'not_configured', nodeId });
    const taken = await prisma.materialDetectionRun.updateMany({
      where: { nodeId, status: 'failed', attempts: run.attempts, startedAt: run.startedAt },
      data: { ...takeover, status: 'pending' },
    });
    if (taken.count !== 1) return decided({ status: 'in_progress', nodeId });
    return { kind: 'claimed', claim: { token, previous: run } };
  }

  // Not a known status (the CHECK constraint makes this unreachable).
  return decided({ status: 'failed', nodeId, errorCode: 'db_error' });
}

/** Records the failure — only while this attempt still holds the claim. */
async function recordFailure(
  nodeId: string,
  claim: Claim,
  errorCode: DetectionErrorCode,
  at: Date,
): Promise<DetectNodeMaterialsResult> {
  try {
    const marked = await prisma.materialDetectionRun.updateMany({
      where: { nodeId, status: 'pending', claimToken: claim.token },
      data: { status: 'failed', finishedAt: at, errorCode, claimToken: null },
    });
    if (marked.count !== 1) return { status: 'claim_lost', nodeId };
  } catch {
    // The claim stays pending and will be considered abandoned after 90 s.
    log.error('detectNodeMaterials: could not record the failure', { nodeId, errorCode });
  }
  return { status: 'failed', nodeId, errorCode };
}

/** Undoes our claim when the detector turns out not to be configured. */
async function releaseClaim(nodeId: string, claim: Claim): Promise<void> {
  const ours = { nodeId, status: 'pending', claimToken: claim.token };
  try {
    if (!claim.previous) {
      await prisma.materialDetectionRun.deleteMany({ where: ours });
      return;
    }
    const p = claim.previous;
    await prisma.materialDetectionRun.updateMany({
      where: ours,
      data: {
        status: p.status,
        attempts: p.attempts,
        claimToken: p.claimToken,
        detector: p.detector,
        errorCode: p.errorCode,
        startedAt: p.startedAt,
        finishedAt: p.finishedAt,
      },
    });
  } catch {
    log.error('detectNodeMaterials: could not release the claim', { nodeId });
  }
}

export async function detectNodeMaterials(
  input: DetectNodeMaterialsInput,
  deps: DetectNodeMaterialsDeps = {},
): Promise<DetectNodeMaterialsResult> {
  const nodeId = input.node.id;
  if (!nodeId.trim()) throw new Error('detectNodeMaterials: node id is required');
  const now = deps.now ?? (() => new Date());
  const newClaimToken = deps.newClaimToken ?? randomUUID;

  let claim: Claim;
  try {
    const decision = await claimRun(nodeId, now(), newClaimToken());
    if (decision.kind === 'decided') return decision.result;
    claim = decision.claim;
  } catch {
    log.error('detectNodeMaterials: could not read or claim the detection run', {
      nodeId,
      errorCode: 'db_error',
    });
    return { status: 'failed', nodeId, errorCode: 'db_error' };
  }

  // The attempt's budget runs from the claim (see "Timing" above).
  const deadlineMs = deps.attemptDeadlineMs ?? ATTEMPT_DEADLINE_MS;
  const claimedAt = now().getTime();
  const remaining = () => deadlineMs - (now().getTime() - claimedAt);

  const loaded = await settleWithin(input.loadImage, remaining());
  if (loaded.kind !== 'value') {
    log.warn('detectNodeMaterials: source image unavailable', {
      nodeId,
      errorCode: 'image_unavailable',
      reason: loaded.kind,
    });
    return recordFailure(nodeId, claim, 'image_unavailable', now());
  }

  const budget = remaining();
  if (budget <= 0) {
    log.warn('detectNodeMaterials: no time left for the detector', { nodeId });
    return recordFailure(nodeId, claim, 'detector_timeout', now());
  }

  let detection: VisionDetectionResult;
  try {
    detection = await detectMaterialsDetailed(loaded.value, input.node.mimeType, {
      deadlineMs: budget,
    });
  } catch {
    // detectMaterialsDetailed does not throw; this is a safety net.
    detection = { kind: 'error', code: 'unknown' };
  }

  if (detection.kind === 'not_configured') {
    await releaseClaim(nodeId, claim);
    log.warn('detectNodeMaterials: skipped — detector not configured', { nodeId });
    return { status: 'not_configured', nodeId };
  }
  if (detection.kind === 'invalid_response') {
    log.warn('detectNodeMaterials: unreadable detector answer', {
      nodeId,
      reason: detection.reason,
    });
    return recordFailure(nodeId, claim, 'detector_invalid_response', now());
  }
  if (detection.kind === 'error') {
    const errorCode = errorCodeForVision(detection.code);
    log.warn('detectNodeMaterials: detector failed', { nodeId, errorCode });
    return recordFailure(nodeId, claim, errorCode, now());
  }
  const detected = detection.materials;

  const { rows, rejected } = prepareDetections(nodeId, detected);
  if (rejected.length > 0) {
    const counts: Record<string, number> = {};
    for (const r of rejected) counts[r] = (counts[r] ?? 0) + 1;
    log.warn('detectNodeMaterials: detections ignored', { nodeId, ...counts });
  }

  try {
    const finishedAt = now();
    const committed = await prisma.$transaction(
      async (tx) => {
        // Re-check the claim first: this row lock also makes a concurrent
        // takeover wait for us, then miss (the status is no longer "pending").
        const owned = await tx.materialDetectionRun.updateMany({
          where: { nodeId, status: 'pending', claimToken: claim.token },
          data: { status: 'succeeded', finishedAt, errorCode: null, claimToken: null },
        });
        if (owned.count !== 1) return false;
        await tx.materialDetection.deleteMany({ where: { nodeId } });
        if (rows.length > 0) await tx.materialDetection.createMany({ data: rows });
        return true;
      },
      { maxWait: SAVE_TX_MAX_WAIT_MS, timeout: SAVE_TX_TIMEOUT_MS },
    );
    if (!committed) {
      log.warn('detectNodeMaterials: claim lost before saving', { nodeId });
      return { status: 'claim_lost', nodeId };
    }
  } catch {
    log.error('detectNodeMaterials: could not save the detections', {
      nodeId,
      errorCode: 'persist_error',
    });
    return recordFailure(nodeId, claim, 'persist_error', now());
  }

  log.info('detectNodeMaterials: detected', { nodeId, count: rows.length });
  return { status: 'succeeded', nodeId, reused: false, materials: rows.map((r) => ({ ...r })) };
}
