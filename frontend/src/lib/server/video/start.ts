// Launching a video job (2026-11-07). The order of the six steps below is
// the whole design, and each one is placed where it is because of what
// happens if the process dies right after it.
//
//   1. price it      — no verified price, no job (409, nothing debited);
//   2. debit         — one conditional UPDATE, so two clicks cannot pay twice;
//   3. write the row — PENDING, with what was charged. If we die HERE the
//                      user is debited and the site SAYS so: a PENDING row
//                      with no task is a debt the sweeper refunds. Writing
//                      the row after the Kie call would instead leave a
//                      charge with no trace at all;
//   4. upload frames — to Kie's file store;
//   5. create        — the task, with the callback URL;
//   6. mark RUNNING  — with the task id.
//
// Anything that fails from step 4 on fails the row and refunds in full,
// because nothing was produced. A refusal before step 2 costs nothing.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { videoPrice } from '@/lib/provider-cost';
import { debitCredits, refundCredits } from '@/lib/server/generation/tier-quota';
import { createLogger } from '@/lib/server/logger';
import {
  buildVideoTask,
  VideoRequestError,
  type VideoRequest,
} from '@/lib/server/generation/video-adapters';
import { buildVideoPrompt, type VideoPromptInput } from '@/lib/server/generation/video-prompt';
import { createVideoTask, uploadFrame } from './kie-video';
import { videoCallbackUrl } from './callback-token';

const log = createLogger();

export interface StartVideoInput {
  userId: string;
  /** The render being animated, already read and owned by this account. */
  source: { nodeId: string | null; buffer: Buffer; mimeType: string } | null;
  /** The end frame, for the engines that take one. */
  endFrame: { buffer: Buffer; mimeType: string } | null;
  /** Reference pictures, for `reference` mode. */
  references: readonly { buffer: Buffer; mimeType: string }[];
  settings: VideoPromptInput & {
    mode: VideoRequest['mode'];
    duration: number;
    resolution: string;
    ratio?: string | undefined;
    audio: boolean;
    seed?: number | undefined;
  };
}

export type StartVideoResult =
  | { ok: true; jobId: string; credits: number }
  | {
      ok: false;
      code:
        | 'PRICE_NOT_VERIFIED'
        | 'INSUFFICIENT_CREDITS'
        | 'NO_ACTIVE_TIER'
        | 'INVALID_REQUEST'
        | 'PROVIDER_UNAVAILABLE';
      message: string;
      balance?: number | null;
      cost?: number;
    };

export async function startVideoJob(
  prisma: PrismaClient,
  input: StartVideoInput,
  appUrl: string,
): Promise<StartVideoResult> {
  const s = input.settings;

  // 1. Priced first: an unverified combination is refused before anything
  //    else happens, exactly as an unverified image version is.
  const cost = videoPrice(s.model, s.duration, s.resolution);
  if (cost === null) {
    return {
      ok: false,
      code: 'PRICE_NOT_VERIFIED',
      message: `no verified price for ${s.model} ${s.duration}s ${s.resolution}`,
    };
  }

  // The prompt is built before the debit too: a request the adapter will
  // refuse must not cost a credit. buildVideoTask is called again at step 5
  // with the real URLs — here it only has to be buildable.
  const built = buildVideoPrompt(s);

  // 2. The debit. One conditional UPDATE: quick double clicks cannot spend
  //    twice, the same guarantee the image routes have.
  const debit = await debitCredits(prisma, input.userId, cost);
  if (!debit.ok) {
    return {
      ok: false,
      code: debit.reason === 'NO_ACTIVE_TIER' ? 'NO_ACTIVE_TIER' : 'INSUFFICIENT_CREDITS',
      message: debit.reason ?? 'INSUFFICIENT_CREDITS',
      balance: debit.balance,
      cost,
    };
  }

  // 3. The row, before Kie is touched. A debit with no row is a charge
  //    nothing on the site can account for.
  const job = await prisma.videoJob.create({
    data: {
      userId: input.userId,
      sourceNodeId: input.source?.nodeId ?? null,
      model: s.model,
      mode: s.mode,
      camera: s.camera,
      environment: [...s.environment],
      intensity: s.intensity,
      prompt: built.prompt,
      duration: s.duration,
      resolution: s.resolution,
      audio: s.audio,
      status: 'PENDING',
      creditsCharged: cost,
    },
  });

  /** Everything from here on is refundable: nothing was produced. */
  const fail = async (code: string, message: string): Promise<StartVideoResult> => {
    await prisma.videoJob.updateMany({
      where: { id: job.id, status: 'PENDING' },
      data: {
        status: 'FAILED',
        failCode: code,
        failMsg: message.slice(0, 500),
        finishedAt: new Date(),
        refundedAt: new Date(),
      },
    });
    await refundCredits(prisma, input.userId, cost);
    log.error('video: the job could not be started, credits given back', {
      jobId: job.id,
      model: s.model,
      code,
      message,
    });
    return { ok: false, code: 'PROVIDER_UNAVAILABLE', message };
  };

  try {
    // 4. The frames, in Kie's file store.
    const firstFrameUrl = input.source
      ? await uploadFrame(input.source.buffer, input.source.mimeType)
      : undefined;
    const lastFrameUrl = input.endFrame
      ? await uploadFrame(input.endFrame.buffer, input.endFrame.mimeType)
      : undefined;
    const referenceUrls: string[] = [];
    for (const ref of input.references) {
      referenceUrls.push(await uploadFrame(ref.buffer, ref.mimeType));
    }

    const task = buildVideoTask({
      model: s.model,
      mode: s.mode,
      firstFrameUrl,
      lastFrameUrl,
      referenceUrls,
      prompt: built.prompt,
      negativePrompt: built.negativePrompt,
      duration: s.duration,
      resolution: s.resolution,
      ratio: s.ratio,
      audio: s.audio,
      seed: s.seed,
    });

    // 5. The task, with the callback that will settle it.
    const taskId = await createVideoTask(task, videoCallbackUrl(job.id, appUrl));

    // 6. Only now is the job really running.
    await prisma.videoJob.updateMany({
      where: { id: job.id, status: 'PENDING' },
      data: { status: 'RUNNING', providerTaskId: taskId },
    });

    return { ok: true, jobId: job.id, credits: cost };
  } catch (err: unknown) {
    if (err instanceof VideoRequestError) {
      // Our own mistake, not Kie's. Still refunded — the user did nothing
      // wrong and got nothing.
      return fail(err.code, err.message);
    }
    return fail('PROVIDER_ERROR', String(err));
  }
}
