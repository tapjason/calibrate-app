// Tests only: run `fn` with the clock set `days` earlier, so what it logs
// is stamped on an earlier day. An answer given the day a prediction was
// logged isn't scored (roadmap D41), so a test that logs and answers in one
// go logs "yesterday" through this.
//
// Only Date is faked: timers, microtasks and nextTick stay real, so async
// database work inside `fn` runs as usual.

const KEEP_REAL = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

const DAY_MS = 86_400_000;

export async function loggedEarlier<T>(fn: () => Promise<T>, days = 1): Promise<T> {
  jest.useFakeTimers({ doNotFake: [...KEEP_REAL], now: Date.now() - days * DAY_MS });
  try {
    return await fn();
  } finally {
    jest.useRealTimers();
  }
}
