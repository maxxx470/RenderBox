// withDeadline: the wait ends at the deadline whatever the call does, the
// call's signal is aborted then, and nothing is left behind (timer, unhandled
// rejection). Fake timers, no network.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { withDeadline } from './deadline';

class TimeUp extends Error {
  override name = 'TimeUp';
}

afterEach(() => {
  vi.useRealTimers();
});

describe('withDeadline', () => {
  it('resolves with the call’s value when it settles in time, and clears its timer', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const value = await withDeadline(
      1_000,
      async (s) => {
        signal = s;
        return 'done';
      },
      () => new TimeUp(),
    );
    expect(value).toBe('done');
    expect(vi.getTimerCount()).toBe(0);
    expect(signal?.aborted).toBe(false);
  });

  it('rejects with the call’s own error when it fails in time', async () => {
    const err = new Error('upstream');
    await expect(
      withDeadline(
        1_000,
        () => Promise.reject(err),
        () => new TimeUp(),
      ),
    ).rejects.toBe(err);
  });

  it('turns a synchronous throw into a rejection and clears the timer', async () => {
    vi.useFakeTimers();
    const err = new Error('sync');
    await expect(
      withDeadline(
        1_000,
        () => {
          throw err;
        },
        () => new TimeUp(),
      ),
    ).rejects.toBe(err);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('at the deadline: aborts the signal with the timeout error and stops waiting for a call that never settles', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const outcome = withDeadline(
      1_000,
      (s) => {
        signal = s;
        return new Promise<never>(() => {});
      },
      () => new TimeUp('time is up'),
    ).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await outcome;
    expect(err).toBeInstanceOf(TimeUp);
    expect(signal?.aborted).toBe(true);
    expect(signal?.reason).toBe(err);
  });

  it('stops waiting even while the call sleeps without listening to the signal (an SDK retry pause)', async () => {
    vi.useFakeTimers();
    const outcome = withDeadline(
      1_000,
      () => new Promise((resolve) => setTimeout(() => resolve('late'), 60_000)),
      () => new TimeUp(),
    ).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await outcome).toBeInstanceOf(TimeUp);
  });

  it('leaves no unhandled rejection when the abandoned call fails afterwards', async () => {
    vi.useFakeTimers();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const outcome = withDeadline(
        1_000,
        (s) =>
          new Promise((_, reject) => {
            s.addEventListener('abort', () => setTimeout(() => reject(new Error('aborted')), 10));
          }),
        () => new TimeUp(),
      ).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await outcome).toBeInstanceOf(TimeUp);
      await vi.advanceTimersByTimeAsync(10);
      vi.useRealTimers();
      await new Promise((r) => setTimeout(r, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
