// Bounds how long RenderBox waits for an outside call (a render engine, the
// material detector). The call gets a signal to hand to its SDK, so the
// connection is closed once time is up; and the wait itself ends then too —
// the OpenAI and Anthropic SDKs sleep between retries without listening to
// the signal, so the signal alone would not bound it. What the provider does
// with work already started is out of reach: it may finish it, and bill it.
import 'server-only';

/**
 * Runs `run` with a signal that aborts after `ms`. Resolves or rejects as
 * `run` does if it settles first; otherwise rejects with `onTimeout()` (also
 * the signal's abort reason) without waiting for `run` any longer.
 */
export async function withDeadline<T>(
  ms: number,
  run: (signal: AbortSignal) => Promise<T>,
  onTimeout: () => Error,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = onTimeout();
      controller.abort(err);
      reject(err);
    }, ms);
  });
  // A synchronous throw from `run` becomes a rejection, so the timer is
  // always cleared below.
  const work = (async () => run(controller.signal))();
  // Once time is up, the abandoned call settles later on its own: its
  // outcome is dropped, never left as an unhandled rejection.
  work.catch(() => {});
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}
