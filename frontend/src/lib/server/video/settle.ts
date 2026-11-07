// How a video job ends (2026-11-07). Pure: no database, no clock, no Kie —
// so every outcome below is tested without spending a credit, which is the
// only safety net left once the owner chose to ship with no paid trial run.
//
// Two rules decide everything here, and both exist because money moves:
//
//   1. A TERMINAL STATUS IS FINAL. Kie may call back twice, and our own
//      sweeper may look at the same task a minute later. A job that already
//      succeeded must not be failed by a late `fail`, and a job already
//      refunded must not be refunded again — `refundedAt` is set once, and
//      `alreadyRefunded` is what this function reads instead of guessing.
//
//   2. A SUCCESS WITH NOTHING TO SHOW IS A FAILURE. Kie's `success` only
//      says the task finished; if no video URL came with it there is nothing
//      to hand the user, and billing them for it would be the worst outcome
//      of the two. So it settles FAILED and refunds in full.
//
// The refund on success is the other half of shipping without verified
// prices: we debit an estimate, Kie reports what it really charged, and the
// difference goes back. If Kie charged MORE than we sold the clip for, the
// refund is zero and the loss is visible in the row — never silently
// absorbed, never clawed back from the user after the fact.

/** What the row says today. */
export type VideoJobStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';

const TERMINAL: readonly VideoJobStatus[] = ['SUCCEEDED', 'FAILED', 'EXPIRED'];

export interface SettlementInput {
  /** Kie's `state` on the task record: waiting | queuing | generating |
   *  success | fail. Anything unknown is treated as still running, because
   *  inventing a failure would refund a clip that is about to arrive. */
  state: string;
  current: VideoJobStatus;
  /** The estimate we debited when the job was created. */
  creditsCharged: number;
  /** Kie's own `creditsConsumed`, normalised to credits. Null = not reported. */
  providerCredits: number | null;
  /** True once `refundedAt` is set on the row. */
  alreadyRefunded: boolean;
  /** The finished clip, if Kie gave one. */
  videoUrl: string | null;
}

export interface Settlement {
  status: VideoJobStatus;
  /** Credits to give back, never negative, zero when already refunded. */
  refund: number;
  /** Set when the job ends badly, so the row can say why in the interface. */
  failCode: string | null;
  /** True when the clip must be fetched and stored before the row is marked
   *  SUCCEEDED — the caller does the IO, this function only says so. */
  store: boolean;
}

const RUNNING_STATES = new Set(['waiting', 'queuing', 'generating']);

/** Nothing to do: the row already says the last word. */
function unchanged(current: VideoJobStatus): Settlement {
  return { status: current, refund: 0, failCode: null, store: false };
}

export function decideVideoSettlement(input: SettlementInput): Settlement {
  // A terminal row is never reopened, whatever arrives afterwards.
  if (TERMINAL.includes(input.current)) return unchanged(input.current);

  const state = input.state.toLowerCase();

  if (state === 'fail') {
    return {
      status: 'FAILED',
      refund: input.alreadyRefunded ? 0 : Math.max(0, input.creditsCharged),
      failCode: 'PROVIDER_FAILED',
      store: false,
    };
  }

  if (state === 'success') {
    if (!input.videoUrl) {
      // Finished with nothing to hand over. Billing for that would be worse
      // than any refund.
      return {
        status: 'FAILED',
        refund: input.alreadyRefunded ? 0 : Math.max(0, input.creditsCharged),
        failCode: 'NO_RESULT',
        store: false,
      };
    }
    const over =
      input.providerCredits === null
        ? 0
        : Math.max(0, input.creditsCharged - input.providerCredits);
    return {
      status: 'SUCCEEDED',
      refund: input.alreadyRefunded ? 0 : Math.round(over),
      failCode: null,
      store: true,
    };
  }

  // Still working, or a state Kie added since this was written. Either way
  // the job keeps running: a wrong guess here refunds a clip that arrives a
  // minute later and leaves the user holding a video they did not pay for.
  if (RUNNING_STATES.has(state) || state.length > 0) {
    return { status: 'RUNNING', refund: 0, failCode: null, store: false };
  }

  return unchanged(input.current);
}

/**
 * A job the sweeper finds still running long after it was created. Kie's own
 * ceiling for these models is minutes, not hours, so past the deadline the
 * task is gone and the credits are owed back.
 */
export const VIDEO_JOB_DEADLINE_MS = 30 * 60 * 1000;

export function decideVideoExpiry(input: {
  current: VideoJobStatus;
  createdAt: Date;
  now: Date;
  creditsCharged: number;
  alreadyRefunded: boolean;
}): Settlement | null {
  if (TERMINAL.includes(input.current)) return null;
  if (input.now.getTime() - input.createdAt.getTime() < VIDEO_JOB_DEADLINE_MS) return null;
  return {
    status: 'EXPIRED',
    refund: input.alreadyRefunded ? 0 : Math.max(0, input.creditsCharged),
    failCode: 'DEADLINE',
    store: false,
  };
}
