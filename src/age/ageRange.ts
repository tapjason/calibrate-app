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
//                      age store, and the store learns whether automatic
//                      uploads at launch wait for this launch's ask
//                      (`uploadsMayStart`): on iOS 26 with no stored band, a
//                      stored band under 13, or a stored band that couldn't
//                      be read. A stored band that couldn't be read (the read
//                      threw twice in a row, or the row isn't a band) closes
//                      the gate for the run: only Apple's own answer of 13 or
//                      over lifts it. Where Apple's API can never run (web,
//                      Android, iOS before 26: no band can have been stored),
//                      a read that throws is no band instead; a row that isn't
//                      a band still closes the gate there.
//   ensureAgeBucket()  One ask per process, after the first screen is up and
//                      the app lock is open, wherever the API can run,
//                      whatever is stored. A stored band of 13 or over is
//                      asked about too, in the background: nothing waits for
//                      that ask, since the band belongs to the install and not
//                      to the Apple Account (a parent's phone handed to a
//                      child by switching accounts, or an app restored from a
//                      backup, keeps the adult band). A valid answer is
//                      accepted (saved, and the gate follows it; the same
//                      band as the one stored, with the gate open, changes
//                      and writes nothing); a decline, "not available", a
//                      throw or an answer that isn't a band keeps the stored
//                      band. Always ends in `markSettled`.
//   recheckAgeBucketIfDue(now)
//                      On return to the foreground in a long run: while the
//                      rule applies or a band of 13 or over is known, asks
//                      again once 24 hours have passed since the last ask
//                      (`AGE_RECHECK_MIN_MS`, in memory). Apple caches the
//                      answer and prompts only on its anniversary, so the
//                      repeat is silent.
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
  /**
   * False where this device's OS can never ask Apple (web, Android, iOS
   * before 26), so no band can ever have been stored here: a stored-band read
   * that fails is then no band, not unknown (review round 2, item 2). True on
   * iOS 26 even with the module missing, where an earlier build may have
   * stored one. Optional: a seam without it is read by `isAvailable`.
   */
  couldEverAsk?(): boolean;
  /** The raw API response. May carry fields we must not store. */
  request(): Promise<unknown>;
}

let override: AgeRangeDeps | null = null;
/** The launch's one read of the stored band (`hydrateAgeGate`), once started. */
let hydrating: Promise<void> | null = null;
/** What the launch's read found, once it has, for `run` to fall back on. */
let launchRead: StoredBand | null = null;
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

/**
 * The package's own types (erased at build: nothing is loaded by this line),
 * so the request below is checked against the installed `expo-age-range`.
 * Its response shape is pinned in ageRangeResponse.test.ts (review round 2,
 * item 3). Partial: the export is checked at run time too.
 */
type AgeRangeModule = Partial<Pick<typeof import('expo-age-range'), 'requestAgeRangeAsync'>>;

function loadModule(): AgeRangeModule | null {
  try {
    // Lazy require: the package is absent in Jest, and on web its entry
    // returns a fake adult instead of failing. Callers check the OS first.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-age-range') as AgeRangeModule;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[age] module unavailable:', messageOf(e));
    return null;
  }
}

/** iOS 26 or later: the first OS with Declared Age Range. */
function osCanAsk(): boolean {
  const major = iosMajor();
  return major !== null && major >= 26;
}

function defaultDeps(): AgeRangeDeps {
  return {
    isAvailable() {
      // iOS 26 is the first OS with Declared Age Range. Earlier versions
      // (and web, and Android) must not be asked: the SDK answers those
      // with a synthetic 18, which is not the person's age.
      if (!osCanAsk()) return false;
      const mod = loadModule();
      return typeof mod?.requestAgeRangeAsync === 'function';
    },
    couldEverAsk() {
      // The OS alone: an iOS 26 build missing the module may follow one that
      // had it and stored a band.
      return osCanAsk();
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

/**
 * Whether a band can ever have been stored on this device (`couldEverAsk`, or
 * the seam's `isAvailable` without it). A seam that throws reads as yes: the
 * side that keeps a failed read unknown.
 */
function bandCouldBeStored(): boolean {
  try {
    const deps = getDeps();
    return deps.couldEverAsk ? deps.couldEverAsk() : deps.isAvailable();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[age] availability check failed:', messageOf(e));
    return true;
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

/**
 * What the phone holds: a band, no row at all, or something that can't be
 * known: the read threw (`unreadable`), or the row isn't a band (`invalid`,
 * which only a damaged database could hold: every write is a checked band).
 */
type StoredBand =
  | { kind: 'band'; band: AgeBucket }
  | { kind: 'none' }
  | { kind: 'unknown'; why: 'unreadable' | 'invalid' };

/** The stored row, read once more if the first read throws. Throws when both do. */
async function readRowTwice(): Promise<AgeBucket | null> {
  try {
    return await getAgeBucket();
  } catch (e) {
    // A momentary failure (a busy database) shouldn't close the gate for the
    // run, with what closing it does (review round 2, item 2): once more.
    // eslint-disable-next-line no-console
    console.warn('[age] read failed, reading once more:', messageOf(e));
    return await getAgeBucket();
  }
}

/**
 * The stored band. Never throws. A read that fails twice is `unknown`, not
 * `none`, wherever a band could have been stored; where Apple's API can never
 * run (`bandCouldBeStored`: web, Android, iOS before 26) it is `none`, since
 * no band can be there. A row that isn't a band is `unknown` everywhere.
 */
async function readStoredBand(): Promise<StoredBand> {
  let raw: AgeBucket | null;
  try {
    raw = await readRowTwice();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[age] read failed:', messageOf(e));
    if (!bandCouldBeStored()) return { kind: 'none' };
    // Not "no band": a row that may say under 13 couldn't be read. The gate
    // stays shut for the run unless Apple answers 13 or over.
    return { kind: 'unknown', why: 'unreadable' };
  }
  if (raw === null) return { kind: 'none' };
  const band = bucketFromResponse(raw);
  return band ? { kind: 'band', band } : { kind: 'unknown', why: 'invalid' };
}

/** The band a stored read gives, or null for none or unknown. */
function bandOf(stored: StoredBand): AgeBucket | null {
  return stored.kind === 'band' ? stored.band : null;
}

/**
 * Whether automatic uploads at launch wait for this launch's ask: no stored
 * band, one under 13, or one that couldn't be read. A stored band of 13 or
 * over is asked about in the background, with nothing waiting.
 */
function uploadsWaitForTheAsk(stored: StoredBand): boolean {
  return stored.kind !== 'band' || isUnder13Band(stored.band);
}

/**
 * Close the gate for a stored band that couldn't be read, through the age
 * store's `loadUnknown`: one write (no band, the gate closed, `settled` false
 * when `willAsk`), so no subscriber ever sees the gate open with `settled`
 * true. With `willAsk` null (`run`, after the launch's read), `settled` stays
 * as it is. Only Apple's own answer of 13 or over lifts it (`accept`).
 */
function closeGateForUnknownBand(willAsk: boolean | null): void {
  const age = useAgeStore.getState();
  age.loadUnknown({ willAsk: willAsk ?? !age.settled });
}

/** Two bands with the same bounds. */
function sameBand(a: AgeBucket, b: AgeBucket): boolean {
  return a.lowerBound === b.lowerBound && a.upperBound === b.upperBound;
}

/**
 * Put the stored band into the age store, before anything can upload. Called
 * once at launch, after the database opens and before the auth store
 * initialises (app/_layout.tsx). A stored band that can't be read closes the
 * gate for the run (`closeGateForUnknownBand`); no row at all is no band.
 * When this launch's ask is one uploads wait for (it can ask, and the stored
 * band is none, under 13 or unknown), the store stays unsettled until
 * `ensureAgeBucket` has asked, so the guest flush and RevenueCat wait for the
 * answer. A stored band of 13 or over is settled at once: its ask runs in the
 * background. Once per process: a second call returns the first one's promise
 * (a later `load` would leave the store waiting for an ask that has already
 * happened). Never throws or rejects.
 */
export function hydrateAgeGate(): Promise<void> {
  if (!hydrating) {
    hydrating = (async () => {
      try {
        const stored = await readStoredBand();
        launchRead = stored;
        // Not once the launch's ask has started: its answer is newer.
        if (pending !== null) return;
        const willAsk = canAsk() && uploadsWaitForTheAsk(stored);
        if (stored.kind === 'unknown') closeGateForUnknownBand(willAsk);
        else useAgeStore.getState().load(bandOf(stored), { willAsk });
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
 * other lifts it only once saved). An answer equal to `known` while the gate
 * is open changes nothing and writes nothing. Returns the band this run now
 * goes by: the answer when it applies (an under-13 one even if it couldn't be
 * saved), or else `known`. A decline, "not available", a throw or a response
 * that isn't a band keeps `known`, and the gate as it is.
 */
async function askApple(known: AgeBucket | null): Promise<AgeBucket | null> {
  lastAskAt = Date.now();
  let raw: unknown;
  try {
    raw = await getDeps().request();
  } catch (e) {
    // Decline (ERR_AGE_RANGE_USER_DECLINED), not available
    // (ERR_AGE_RANGE_NOT_AVAILABLE), or a bug.
    // eslint-disable-next-line no-console
    console.warn('[age] request failed:', messageOf(e));
    return known;
  }
  const bucket = bucketFromResponse(raw);
  if (!bucket) return known;
  if (known !== null && sameBand(bucket, known) && !useAgeStore.getState().localOnly) return bucket;
  const saved = await useAgeStore.getState().accept(bucket);
  return saved || isUnder13Band(bucket) ? bucket : known;
}

/**
 * What `run` goes by when its own read can't tell: a read that fails here,
 * after this launch's own read found a band, goes by that band (between the
 * two only `accept`, which writes what it holds, or Erase, which clears the
 * store's band too, could have changed it); one that throws after the
 * launch's read found no row goes by that (review round 2, item 2: no write
 * between them could have added a row, `accept` running only later, in
 * `askApple`). Otherwise the read stands.
 */
function storedForRun(read: StoredBand): StoredBand {
  if (read.kind !== 'unknown') return read;
  const known = useAgeStore.getState().bucket;
  if (known !== null) return { kind: 'band', band: known };
  if (read.why === 'unreadable' && launchRead?.kind === 'none') return { kind: 'none' };
  return read;
}

async function run(): Promise<AgeBucket | null> {
  const stored = storedForRun(await readStoredBand());
  // A stored under-13 band, or one that can't be read, applies even if
  // `hydrateAgeGate` didn't run first (it turns the gate on, never off, and
  // leaves `settled` as it is).
  if (!useAgeStore.getState().localOnly) {
    if (stored.kind === 'unknown') closeGateForUnknownBand(null);
    else if (stored.kind === 'band' && isUnder13Band(stored.band)) {
      useAgeStore.getState().load(stored.band, { willAsk: !useAgeStore.getState().settled });
    }
  }
  if (!canAsk()) return bandOf(stored);
  // Whatever is stored, a band of 13 or over included (in the background:
  // nothing waits for it, see `uploadsWaitForTheAsk`).
  return await askApple(bandOf(stored));
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
 * The launch's one ask, wherever the API can run, whatever is stored (a band
 * of 13 or over in the background, with the store already settled), and never
 * again in this process (a second call returns the first one's promise).
 * Always resolves, and always ends in the age store's `markSettled`, on every
 * path, a throw included. Returns the band this run goes by (see `askApple`),
 * or null for none or unknown.
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
 * Whether a foreground re-ask applies: the rule is on, or the run knows a band
 * of 13 or over (stored, or Apple's latest answer), which a change of Apple
 * Account on this phone would make stale. Not with no band (declined, not
 * available): that is asked again at the next launch.
 */
function recheckApplies(): boolean {
  const { localOnly, bucket } = useAgeStore.getState();
  return localOnly || (bucket !== null && !isUnder13Band(bucket));
}

/**
 * Ask Apple again while the rule applies or a band of 13 or over is known, at
 * most once per `AGE_RECHECK_MIN_MS` since this run's last ask (call 5): for a
 * return to the foreground in a long run. Call it only when the app is active
 * and the app lock is open (Apple's sheet must not open under the lock
 * screen). Does nothing before the launch's own ask has finished, while a
 * re-ask is running, with no band and no rule, or where the API can't run. A
 * valid answer is accepted (an under-13 band closes the gate at once; one that
 * isn't lifts it once saved; the band already known, with the gate open,
 * changes nothing); anything else keeps the band. Nothing waits for it.
 * Resolves true when it asked. Never rejects.
 */
export function recheckAgeBucketIfDue(now: Date | number = Date.now()): Promise<boolean> {
  if (recheckRunning) return recheckRunning;
  try {
    const nowMs = typeof now === 'number' ? now : now.getTime();
    if (!Number.isFinite(nowMs) || lastAskAt === null || pending === null) {
      return Promise.resolve(false);
    }
    if (nowMs - lastAskAt < AGE_RECHECK_MIN_MS) return Promise.resolve(false);
    if (!recheckApplies()) return Promise.resolve(false);
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
      if (!recheckApplies() || !canAsk()) return false;
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
  launchRead = null;
  pending = null;
  recheckRunning = null;
  lastAskAt = null;
}
