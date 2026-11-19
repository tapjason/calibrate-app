// Declared Age Range (L5). The only module that talks to expo-age-range.
//
// The band gates uploads (roadmap D70, 2026-11-19;
// docs/design/research/under-13-2026-11.md). A band that includes ages under
// 13 (`isUnder13Band`) makes the phone local-only: no sign-in, sync, usage
// counts, Coach or RevenueCat, everything else as usual. The age store
// (src/store/ageStore.ts) carries it; every upload path reads it there.
//
// Three entry points:
//
//   hydrateAgeGate()   At launch, after the database opens and before the
//                      auth store initialises: the stored band goes into the
//                      age store, and the store learns whether this launch
//                      will ask Apple (iOS 26 with no stored band, or a stored
//                      band under 13). Until it has asked, automatic uploads
//                      at launch wait (`uploadsMayStart`).
//   ensureAgeBucket()  One ask per process, after the first screen is up and
//                      the app lock is open. Asks when there is no stored band
//                      or the stored band is under 13; a stored band that
//                      isn't under 13 is never asked again. A valid answer is
//                      accepted (saved, and the gate follows it); a decline,
//                      "not available", a throw or an answer that isn't a band
//                      keeps the stored band. Always ends in `markSettled`.
//   recheckAgeBucketIfDue(now)
//                      On return to the foreground in a long run: while the
//                      rule applies, asks again once 24 hours have passed
//                      since the last ask (`AGE_RECHECK_MIN_MS`, in memory).
//                      Apple caches the answer and prompts only on its
//                      anniversary, so the repeat is silent.
//
// Everywhere the API cannot run (web, Android, iOS before 26, the native
// module missing) nothing is asked, nothing waits and the app goes on as
// before. The SDK's own fallback there is a fake adult (`lowerBound: 18`),
// which is not a declaration: this module never calls the API there, so the
// fake is never stored.
//
// Apple drops a revoked consent by refusing to launch the app, so there is
// no server call and no rescind handler. Nothing here logs a band: an age is
// personal data.

import { Platform } from 'react-native';

import { getAgeBucket } from '@/db/ageBucket';
import { isUnder13Band } from '@/engine/ageBand';
import { useAgeStore } from '@/store/ageStore';
import type { AgeBucket } from '@/types';

/**
 * Apple's sample gates, each at least two years apart (closer than that is
 * an invalid request). The app is rated 4+. A band under the first gate makes
 * the phone local-only (D70); the other two change nothing.
 */
const AGE_GATES = { threshold1: 13, threshold2: 16, threshold3: 18 } as const;

/**
 * The least time between two asks in one run while the rule applies (call
 * 5): a return to the foreground asks again only once this much has passed
 * since the last ask. In memory: a new launch asks once anyway.
 */
export const AGE_RECHECK_MIN_MS = 24 * 60 * 60 * 1000;

/** What the seam needs. Tests pass a fake; production loads the module. */
export interface AgeRangeDeps {
  /** False when this device cannot actually ask Apple. */
  isAvailable(): boolean;
  /** The raw API response. May carry fields we must not store. */
  request(): Promise<unknown>;
}

let override: AgeRangeDeps | null = null;
/** The launch's one read of the stored band (`hydrateAgeGate`), once started. */
let hydrating: Promise<void> | null = null;
/** The launch's one ask (`ensureAgeBucket`), once started. */
let pending: Promise<AgeBucket | null> | null = null;
/** A foreground re-ask still running (`recheckAgeBucketIfDue`). */
let recheckRunning: Promise<boolean> | null = null;
/** When this run last asked Apple (ms since the epoch), or null before the launch's ask. */
let lastAskAt: number | null = null;

function iosMajor(): number | null {
  if (Platform.OS !== 'ios') return null;
  const raw = Platform.Version;
  const major =
    typeof raw === 'number' ? Math.trunc(raw) : Number.parseInt(String(raw), 10);
  return Number.isFinite(major) ? major : null;
}

function loadModule(): { requestAgeRangeAsync?: (options: typeof AGE_GATES) => Promise<unknown> } | null {
  try {
    // Lazy require: the package is absent in Jest, and on web its entry
    // returns a fake adult instead of failing. Callers check the OS first.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-age-range') as {
      requestAgeRangeAsync?: (options: typeof AGE_GATES) => Promise<unknown>;
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[age] module unavailable:', messageOf(e));
    return null;
  }
}

function defaultDeps(): AgeRangeDeps {
  return {
    isAvailable() {
      // iOS 26 is the first OS with Declared Age Range. Earlier versions
      // (and web, and Android) must not be asked: the SDK answers those
      // with a synthetic 18, which is not the person's age.
      const major = iosMajor();
      if (major === null || major < 26) return false;
      const mod = loadModule();
      return typeof mod?.requestAgeRangeAsync === 'function';
    },
    async request() {
      const mod = loadModule();
      if (!mod?.requestAgeRangeAsync) {
        throw new Error('Declared Age Range is not available');
      }
      return await mod.requestAgeRangeAsync(AGE_GATES);
    },
  };
}

function getDeps(): AgeRangeDeps {
  return override ?? defaultDeps();
}

/** Whether this device can ask Apple. A seam that throws reads as no. */
function canAsk(): boolean {
  try {
    return getDeps().isAvailable();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[age] availability check failed:', messageOf(e));
    return false;
  }
}

/** An error's code and message for the log, never the object (it may carry the response). */
function messageOf(e: unknown): string {
  if (typeof e !== 'object' || e === null) return 'unknown error';
  const { code, message } = e as { code?: unknown; message?: unknown };
  const parts: string[] = [];
  if (typeof code === 'string' || typeof code === 'number') parts.push(`[${code}]`);
  if (typeof message === 'string') parts.push(message);
  return parts.length > 0 ? parts.join(' ') : 'unknown error';
}

const INVALID = Symbol('invalid-bound');

function bound(value: unknown): number | null | typeof INVALID {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 120) {
    return INVALID;
  }
  return value;
}

/**
 * The two bounds, or null when this response is not a band we can keep.
 * Extra fields on the object are ignored.
 */
function bucketFromResponse(raw: unknown): AgeBucket | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const lower = bound(rec.lowerBound);
  const upper = bound(rec.upperBound);
  if (lower === INVALID || upper === INVALID) return null;
  if (lower === null && upper === null) return null;
  if (lower !== null && upper !== null && lower >= upper) return null;
  return { lowerBound: lower, upperBound: upper };
}

/** The stored band, or null for none, for one that isn't a band, or when it can't be read. */
async function readStoredBand(): Promise<AgeBucket | null> {
  try {
    return bucketFromResponse(await getAgeBucket());
  } catch (e) {
    // Reads as no band (call 7). A launch that asks then asks Apple, whose
    // cached answer brings the band back for this run.
    // eslint-disable-next-line no-console
    console.warn('[age] read failed:', messageOf(e));
    return null;
  }
}

/** Whether a launch with this stored band asks Apple: none, or one under 13. */
function bandIsAskedAbout(stored: AgeBucket | null): boolean {
  return stored === null || isUnder13Band(stored);
}

/**
 * Put the stored band into the age store, before anything can upload. Called
 * once at launch, after the database opens and before the auth store
 * initialises (app/_layout.tsx). A read that fails reads as no band. When this
 * launch will ask Apple (it can, and the stored band is none or under 13), the
 * store stays unsettled until `ensureAgeBucket` has asked, so the guest flush
 * and RevenueCat wait for the answer. Once per process: a second call returns
 * the first one's promise (a later `load` would leave the store waiting for an
 * ask that has already happened). Never throws or rejects.
 */
export function hydrateAgeGate(): Promise<void> {
  if (!hydrating) {
    hydrating = (async () => {
      try {
        const stored = await readStoredBand();
        // Not once the launch's ask has started: its answer is newer.
        if (pending !== null) return;
        useAgeStore.getState().load(stored, { willAsk: canAsk() && bandIsAskedAbout(stored) });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[age] could not load the age range:', messageOf(e));
      }
    })();
  }
  return hydrating;
}

/**
 * Ask Apple once and apply a valid answer through the age store's `accept`
 * (saved, and the gate follows it: an under-13 band closes it at once, any
 * other lifts it only once saved). Returns the band this run now goes by: the
 * answer when it applies (an under-13 one even if it couldn't be saved), or
 * else `stored`. A decline, "not available", a throw or a response that isn't
 * a band keeps `stored`.
 */
async function askApple(stored: AgeBucket | null): Promise<AgeBucket | null> {
  lastAskAt = Date.now();
  let raw: unknown;
  try {
    raw = await getDeps().request();
  } catch (e) {
    // Decline (ERR_AGE_RANGE_USER_DECLINED), not available
    // (ERR_AGE_RANGE_NOT_AVAILABLE), or a bug.
    // eslint-disable-next-line no-console
    console.warn('[age] request failed:', messageOf(e));
    return stored;
  }
  const bucket = bucketFromResponse(raw);
  if (!bucket) return stored;
  const saved = await useAgeStore.getState().accept(bucket);
  return saved || isUnder13Band(bucket) ? bucket : stored;
}

async function run(): Promise<AgeBucket | null> {
  const stored = await readStoredBand();
  // A stored under-13 band applies even if `hydrateAgeGate` didn't run first
  // (it turns the gate on, never off, and leaves `settled` as it is).
  if (isUnder13Band(stored) && !useAgeStore.getState().localOnly) {
    useAgeStore.getState().load(stored, { willAsk: !useAgeStore.getState().settled });
  }
  // Any other stored band is never asked about again (call 5).
  if (!bandIsAskedAbout(stored)) return stored;
  if (!canAsk()) return stored;
  return await askApple(stored);
}

/** The launch has its answer, or won't get one: what waits for it goes on. Never throws. */
function settle(): void {
  try {
    useAgeStore.getState().markSettled();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[age] could not settle:', messageOf(e));
  }
}

/**
 * The launch's one ask. Asks when there is no stored band or the stored band
 * is under 13, and never again in this process (a second call returns the
 * first one's promise). Always resolves, and always ends in the age store's
 * `markSettled`, on every path, a throw included. Returns the band this run
 * goes by (see `askApple`), or null for none.
 */
export function ensureAgeBucket(): Promise<AgeBucket | null> {
  if (!pending) {
    pending = (async () => {
      try {
        return await run();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[age] check failed:', messageOf(e));
        return null;
      } finally {
        settle();
      }
    })();
  }
  return pending;
}

/**
 * Ask Apple again while the rule applies, at most once per
 * `AGE_RECHECK_MIN_MS` since this run's last ask (call 5): for a return to
 * the foreground in a long run. Call it only when the app is active and the
 * app lock is open (Apple's sheet must not open under the lock screen). Does
 * nothing before the launch's own ask has finished, while a re-ask is
 * running, when the rule doesn't apply, or where the API can't run. A valid
 * answer is accepted (a band that isn't under 13 lifts the gate once saved);
 * anything else keeps the band. Resolves true when it asked. Never rejects.
 */
export function recheckAgeBucketIfDue(now: Date | number = Date.now()): Promise<boolean> {
  if (recheckRunning) return recheckRunning;
  try {
    const nowMs = typeof now === 'number' ? now : now.getTime();
    if (!Number.isFinite(nowMs) || lastAskAt === null || pending === null) {
      return Promise.resolve(false);
    }
    if (nowMs - lastAskAt < AGE_RECHECK_MIN_MS) return Promise.resolve(false);
    if (!useAgeStore.getState().localOnly) return Promise.resolve(false);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[age] recheck failed:', messageOf(e));
    return Promise.resolve(false);
  }
  const launchAsk = pending;
  recheckRunning = (async () => {
    try {
      // The launch's ask first: one request at a time.
      await launchAsk;
      if (!useAgeStore.getState().localOnly || !canAsk()) return false;
      await askApple(useAgeStore.getState().bucket);
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[age] recheck failed:', messageOf(e));
      return false;
    } finally {
      recheckRunning = null;
    }
  })();
  return recheckRunning;
}

/** Test-only. Null returns to the real platform seam; the run's asks are forgotten. */
export function __setAgeRangeDepsForTests(next: AgeRangeDeps | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setAgeRangeDepsForTests is only allowed when NODE_ENV=test');
  }
  override = next;
  hydrating = null;
  pending = null;
  recheckRunning = null;
  lastAskAt = null;
}
