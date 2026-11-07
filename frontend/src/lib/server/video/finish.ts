// Closing a video job (2026-11-07): the one path the callback and the
// sweeper both take, so a clip cannot be settled two different ways.
//
// The shape is the one the payment reconcile already uses, for the same
// reason — money moves here:
//   - the decision is pure (settle.ts) and tested without a database;
//   - the write is a COMPARE-AND-SWAP on the row's current status, so two
//     callers racing on the same job cannot both settle it;
//   - the refund is guarded by `refundedAt`, set in the same update, so a
//     replayed callback cannot pay twice.
//
// And the body of a callback is never believed: `finishVideoJob` re-asks Kie
// through recordInfo before anything moves, exactly as the Moneriz webhook
// re-asks Moneriz.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { refundCredits } from '@/lib/server/generation/tier-quota';
import { uploadBuffer } from '@/lib/server/upload/vercel-blob-client';
import { createLogger } from '@/lib/server/logger';
import { decideVideoSettlement, type VideoJobStatus } from './settle';
import { isR2Configured, putVideo, videoKey } from './r2';
import { downloadVideo, readVideoTask } from './kie-video';

const log = createLogger();

/** Statuses a job may still be moved from. A terminal row is never reopened. */
const OPEN: readonly VideoJobStatus[] = ['PENDING', 'RUNNING'];

export interface FinishResult {
  status: VideoJobStatus;
  refunded: number;
  stored: boolean;
}

/**
 * Settle one job against what Kie really says. Returns null when the job is
 * unknown, already terminal, or has no task to ask about — all three being
 * normal, not errors: a callback can arrive after the sweeper got there.
 */
export async function finishVideoJob(
  prisma: PrismaClient,
  jobId: string,
): Promise<FinishResult | null> {
  const job = await prisma.videoJob.findUnique({ where: { id: jobId } });
  if (!job || !job.providerTaskId) return null;
  if (!OPEN.includes(job.status as VideoJobStatus)) return null;

  const record = await readVideoTask(job.providerTaskId, job.creditsCharged);
  const decision = decideVideoSettlement({
    state: record.state,
    current: job.status as VideoJobStatus,
    creditsCharged: job.creditsCharged,
    providerCredits: record.providerCredits,
    alreadyRefunded: job.refundedAt !== null,
    videoUrl: record.videoUrl,
  });

  if (decision.status === job.status) {
    // Still running: record what Kie said and leave the row open.
    return { status: decision.status, refunded: 0, stored: false };
  }

  // The clip is fetched BEFORE the row is marked SUCCEEDED: a row that says
  // « ready » with no file is worse than one that is still working, and Kie
  // keeps its own copy long enough for the sweeper to try again.
  let blobUrl: string | null = null;
  let mimeType: string | null = null;
  let sizeBytes: number | null = null;
  if (decision.store && record.videoUrl) {
    try {
      const { buffer, mimeType: type } = await downloadVideo(record.videoUrl);
      // R2 when it is configured: private, and read straight from a bucket
      // whose egress is free instead of through Vercel's bandwidth. Without
      // it the clip still lands somewhere and still works — on Vercel Blob,
      // behind the proxy, which is correct and merely expensive.
      if (isR2Configured()) {
        const stored = await putVideo(videoKey(job.userId, job.id), buffer, type);
        blobUrl = stored.marker;
        sizeBytes = stored.bytes;
      } else {
        const stored = await uploadBuffer(`video/${job.userId}/${job.id}.mp4`, buffer, type);
        blobUrl = stored.blobUrl;
        sizeBytes = stored.bytes;
      }
      mimeType = type;
    } catch (err: unknown) {
      // Kie made the clip and charged for it; we simply could not fetch it
      // yet. Leaving the job open lets the sweeper retry rather than
      // refunding a video that exists.
      log.error('video: the clip could not be stored, job left open', {
        jobId: job.id,
        err: String(err),
      });
      return { status: job.status as VideoJobStatus, refunded: 0, stored: false };
    }
  }

  // Compare-and-swap: only a row still in the status we read may be moved.
  const { count } = await prisma.videoJob.updateMany({
    where: { id: job.id, status: job.status },
    data: {
      status: decision.status,
      finishedAt: new Date(),
      providerCredits: record.providerCredits,
      ...(decision.failCode ? { failCode: decision.failCode } : {}),
      ...(record.failMsg ? { failMsg: record.failMsg.slice(0, 500) } : {}),
      ...(blobUrl ? { blobUrl, mimeType, sizeBytes } : {}),
      ...(decision.refund > 0 ? { refundedAt: new Date() } : {}),
    },
  });
  if (count === 0) {
    // Someone else settled it between our read and our write. Their write
    // stands, and no credit is given back twice.
    return null;
  }

  if (decision.refund > 0) {
    await refundCredits(prisma, job.userId, decision.refund);
  }

  // The loss worth seeing: Kie charged more than we sold the clip for. It is
  // not an error and nothing is clawed back — but it must not be silent.
  if (
    decision.status === 'SUCCEEDED' &&
    record.providerCredits !== null &&
    record.providerCredits > job.creditsCharged
  ) {
    log.error('video: the clip cost more than it was sold for', {
      jobId: job.id,
      model: job.model,
      charged: job.creditsCharged,
      actual: record.providerCredits,
    });
  }

  return { status: decision.status, refunded: decision.refund, stored: blobUrl !== null };
}
