// The sweeper (2026-11-07): the pass that makes the callback optional.
//
// A webhook that must arrive is a webhook that will one day not arrive —
// Kie retries nothing we can rely on, a deploy can land mid-flight, and a
// clip we failed to download leaves its job open on purpose. Without this
// pass every one of those is a user charged for a video they never get, and
// nothing on the site to say so.
//
// Two jobs to do, in this order:
//   1. ask Kie about every open job that has a task — the callback that
//      never came, or came while we were redeploying;
//   2. expire what is past the deadline and give the credits back.
// Step 1 first, because a job that actually succeeded must be settled as a
// success even if it is also past its deadline.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { refundCredits } from '@/lib/server/generation/tier-quota';
import { createLogger } from '@/lib/server/logger';
import { finishVideoJob } from './finish';
import { decideVideoExpiry, VIDEO_JOB_DEADLINE_MS } from './settle';

const log = createLogger();

/** Enough to drain a backlog, small enough to finish inside the route. */
export const SWEEP_LIMIT = 25;

export interface SweepResult {
  looked: number;
  settled: number;
  expired: number;
  refunded: number;
}

/**
 * How often an opportunistic sweep may run, per instance. Short enough that
 * a stuck job is caught within the minute someone looks at the page, long
 * enough that a burst of pollers does not query Kie once per request.
 */
const OPPORTUNISTIC_EVERY_MS = 60_000;

/** Per-instance, deliberately: a missed sweep costs one more poll, and a
 *  Redis lease for this would be machinery for nothing. */
let lastOpportunisticSweep = 0;

/**
 * The sweep nobody has to schedule (2026-11-07).
 *
 * /api/cron/video-sweep is the thorough pass, and it needs an external
 * scheduler because Vercel Hobby runs a declared cron once a day. Relying on
 * that alone would mean a user's refund waits on a dashboard entry somebody
 * remembered to create — so the work also happens on its own, piggybacked on
 * the requests the video module already serves: starting a clip, and polling
 * one. Whoever looks at the page pays for a small sweep, at most once a
 * minute per instance.
 *
 * It never throws: a sweep failing must not fail the request that triggered
 * it. The cron pass stays, for the hours when nobody is looking.
 */
export async function sweepVideoJobsOpportunistically(prisma: PrismaClient): Promise<void> {
  const now = Date.now();
  if (now - lastOpportunisticSweep < OPPORTUNISTIC_EVERY_MS) return;
  // Claimed before the await, so two concurrent requests do not both sweep.
  lastOpportunisticSweep = now;
  try {
    await sweepVideoJobs(prisma, new Date(now), OPPORTUNISTIC_LIMIT);
  } catch (err: unknown) {
    log.warn('video: the opportunistic sweep failed, the cron pass still stands', {
      err: String(err),
    });
  }
}

/** Smaller than the cron's: this one runs inside someone's page load. */
export const OPPORTUNISTIC_LIMIT = 5;

export async function sweepVideoJobs(
  prisma: PrismaClient,
  now: Date = new Date(),
  limit: number = SWEEP_LIMIT,
): Promise<SweepResult> {
  const result: SweepResult = { looked: 0, settled: 0, expired: 0, refunded: 0 };

  const open = await prisma.videoJob.findMany({
    where: { status: { in: ['PENDING', 'RUNNING'] } },
    orderBy: { createdAt: 'asc' },
    take: Math.max(1, Math.min(limit, SWEEP_LIMIT)),
  });
  result.looked = open.length;

  for (const job of open) {
    // 1. Ask Kie, for anything that reached it.
    if (job.providerTaskId) {
      try {
        const settled = await finishVideoJob(prisma, job.id);
        if (settled && settled.status !== 'PENDING' && settled.status !== 'RUNNING') {
          result.settled++;
          result.refunded += settled.refunded;
          continue;
        }
      } catch (err: unknown) {
        // Kie unreachable: leave it open, the next pass tries again. Only
        // the deadline below ever ends a job we cannot reach.
        log.warn('video sweep: could not reach Kie for a job', {
          jobId: job.id,
          err: String(err),
        });
      }
    }

    // 2. Past the deadline, with nothing to show: the credits are owed back.
    const expiry = decideVideoExpiry({
      current: job.status as 'PENDING' | 'RUNNING',
      createdAt: job.createdAt,
      now,
      creditsCharged: job.creditsCharged,
      alreadyRefunded: job.refundedAt !== null,
    });
    if (!expiry) continue;

    // Compare-and-swap, as everywhere a refund hangs on the write: a
    // callback landing at this instant must win or lose cleanly, never both.
    const { count } = await prisma.videoJob.updateMany({
      where: { id: job.id, status: job.status, refundedAt: null },
      data: {
        status: 'EXPIRED',
        failCode: 'DEADLINE',
        finishedAt: now,
        ...(expiry.refund > 0 ? { refundedAt: now } : {}),
      },
    });
    if (count === 0) continue;

    if (expiry.refund > 0) {
      await refundCredits(prisma, job.userId, expiry.refund);
      result.refunded += expiry.refund;
    }
    result.expired++;
    log.warn('video sweep: a job passed its deadline, credits given back', {
      jobId: job.id,
      model: job.model,
      refunded: expiry.refund,
      ageMs: now.getTime() - job.createdAt.getTime(),
      deadlineMs: VIDEO_JOB_DEADLINE_MS,
    });
  }

  return result;
}
