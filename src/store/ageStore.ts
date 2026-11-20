// Age store (L4): whether this phone is local-only under the under-13 rule
// (roadmap D70, 2026-11-19; docs/design/research/under-13-2026-11.md).
//
// When the band Apple's Declared Age Range gave includes ages under 13
// (`isUnder13Band`), nothing leaves the phone: no sign-in, no sync, no usage
// counts, no Coach, no RevenueCat. One field carries it, `localOnly`, read
// through `isLocalOnly()`; every upload path reads that. Automatic uploads at
// launch also wait until Apple has answered on a launch that asks
// (`uploadsMayStart()`, `whenAgeSettled()`), so a child's first launch sends
// nothing before the band arrives.
//
// The gate fails closed. Within a run it is lifted only by Apple's own answer
// of a band that isn't under 13, once that band is saved (`accept`): a stored
// band that couldn't be read closes it (`loadUnknown`), reading the stored
// band again (`load`) never lifts it, an under-13 answer that couldn't be
// saved still applies for the run, and Erase or account deletion,
// which clear the stored band, leave it on for the run (`forgetBand`, call 4:
// the next launch asks Apple again before anything can be sent).
//
// After Erase or account deletion nothing is saved for the rest of the run
// (re-review round two, 2026-11-19): an ask still in flight when the band was
// forgotten, or any later one, closes the gate for an under-13 answer and
// lifts nothing, and its band never reaches the phone's storage, so Erase
// removes the band whatever an ask was doing. A save already running when
// the band is forgotten is undone once it lands.
//
// Defaults, `{ bucket: null, localOnly: false, settled: true }`, are today's
// app: where the question isn't asked (web, Jest, Android, iOS before 26)
// nothing waits and nothing changes. Wherever the API runs, Apple is asked at
// every launch, whatever is stored (src/age/ageRange.ts); `settled` is false
// only while uploads wait for that ask (`willAsk`).
//
// Layer rule: L4, and a leaf. Imports zustand, @/db/ageBucket,
// @/engine/ageBand and @/types only, so other stores and the services can
// both read it without a require cycle. Never logs a band: an age is
// personal data.

import { create } from 'zustand';

import { clearAgeBucket, saveAgeBucket } from '@/db/ageBucket';
import { isUnder13Band } from '@/engine/ageBand';
import type { AgeBucket } from '@/types';

/**
 * What every sign-in and sign-up returns while the rule applies: no account
 * can be made or opened here. Names no age more precisely than "the age
 * range". Here, in the leaf, so the auth service (src/supabase/auth.ts) can
 * return the same words without importing authStore, which imports it;
 * authStore re-exports it.
 */
export const LOCAL_ONLY_SIGN_IN =
  'Accounts are off on this phone because of the age range it shares with Fairly Sure.';

/**
 * The longest a sign-in, a sign-up or a paywall open waits for Apple's answer
 * on a launch that asks, before it goes on as today (call 2): the sheet is
 * modal, so a child can't reach either while it is up.
 */
export const AGE_ANSWER_WAIT_MS = 5000;

/** What `load` is told about this launch. */
export interface AgeLoadOptions {
  /**
   * Uploads wait for this launch's ask: it can ask Apple (iOS 26, the module
   * present) and the stored band is none, under 13, or couldn't be read.
   * `settled` stays false until `markSettled`, so automatic uploads wait for
   * the answer. False when the launch can't ask, and when it asks about a
   * stored band of 13 or over: that ask still runs, in the background, with
   * nothing waiting for it.
   */
  willAsk: boolean;
}

interface AgeState {
  /** The band as this run knows it: the stored one, or Apple's latest answer. Never logged. */
  bucket: AgeBucket | null;
  /** The under-13 rule applies: nothing may leave the phone. Read through `isLocalOnly()`. */
  localOnly: boolean;
  /**
   * Apple has answered on this launch, or uploads don't wait for this
   * launch's ask (it can't ask, or asks about a stored band of 13 or over in
   * the background). False only between `load(…, { willAsk: true })` and
   * `markSettled()`.
   */
  settled: boolean;

  /**
   * The stored band at launch (`hydrateAgeGate`, src/age/ageRange.ts), before
   * anything can upload: the bucket, `localOnly` from it, and `settled` false
   * when uploads wait for this launch's ask (`willAsk`). Fails closed: it
   * turns the gate on, never off (a gate already on in this run stays on
   * until `accept` lifts it).
   */
  load: (bucket: AgeBucket | null, opts: AgeLoadOptions) => void;
  /**
   * The stored band couldn't be read at launch (the read threw, or the row
   * isn't a band; `closeGateForUnknownBand`, src/age/ageRange.ts): no band
   * known, the gate closed for the run, and `settled` false when uploads wait
   * for this launch's ask. One write, so no subscriber sees the gate open on
   * the way. Only a later `accept` of a band that isn't under 13, once saved,
   * lifts it, as for any gate.
   */
  loadUnknown: (opts: AgeLoadOptions) => void;
  /**
   * Apple's answer: a valid band (src/age/ageRange.ts checks the response).
   * Saved through `saveAgeBucket`, and `localOnly` follows it. An under-13
   * band closes the gate at once, before the save, and keeps it closed for
   * the run even if the save fails or is skipped: closing is never skipped.
   * A band that isn't under 13 lifts the gate only once it is saved, and
   * only if no later band or `forgetBand` came in meanwhile: a save that
   * fails lifts nothing, since the stored band (which may be under 13) still
   * stands.
   *
   * Once `forgetBand` has run in this process (Erase, account deletion),
   * nothing is saved and nothing lifted for the rest of the run, whenever the
   * ask began (re-review round two, 2026-11-19): an under-13 answer still
   * closes the gate, in memory. And a save already running when `forgetBand`
   * comes in is undone: the band it wrote is cleared again once it lands.
   *
   * Never throws; true when the band was saved and stays saved.
   */
  accept: (bucket: AgeBucket) => Promise<boolean>;
  /** Apple has answered, or won't on this launch: anything waiting in `whenAgeSettled` goes on. */
  markSettled: () => void;
  /**
   * The stored band was cleared (guest Erase, a confirmed account deletion):
   * `bucket` goes to null at once, and `localOnly` stays as it is for the
   * rest of the run (call 4); from now on `accept` saves nothing. The next
   * launch reads no band and asks Apple again before anything can be sent.
   *
   * When an answer was saved in this run, the caller's wipe may have run
   * before that save landed (re-review round two, 2026-11-19), so the stored
   * band is cleared once more here: true once it is (or when there was
   * nothing to clear), false when that clear failed. The memory change never
   * waits on it. Never throws.
   */
  forgetBand: () => Promise<boolean>;
}

const INITIAL = {
  bucket: null as AgeBucket | null,
  localOnly: false,
  settled: true,
};

/**
 * Bumped by every change of band (`load`, `loadUnknown`, `accept`,
 * `forgetBand`), so a save that finishes after a later change lifts nothing.
 */
let bandVersion = 0;
/**
 * How many times `forgetBand` has run in this process. Above 0, `accept`
 * saves nothing; a change while a save runs undoes that save.
 */
let forgets = 0;
/**
 * Whether `accept` has started a save in this process: only then can a band
 * be on the phone after the caller's wipe, and `forgetBand` clear it again.
 */
let savedThisRun = false;

/** Clear the stored band. True once cleared. Never throws; never logs the band. */
async function clearStoredBand(): Promise<boolean> {
  try {
    await clearAgeBucket();
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[age] could not clear the age range:', e instanceof Error ? e.message : 'unknown error');
    return false;
  }
}

export const useAgeStore = create<AgeState>((set, get) => ({
  ...INITIAL,

  load: (bucket, { willAsk }) => {
    bandVersion += 1;
    set({
      bucket,
      localOnly: get().localOnly || isUnder13Band(bucket),
      settled: !willAsk,
    });
  },

  loadUnknown: ({ willAsk }) => {
    bandVersion += 1;
    set({ bucket: null, localOnly: true, settled: !willAsk });
  },

  accept: async (bucket) => {
    const mine = ++bandVersion;
    const under13 = isUnder13Band(bucket);
    // The gate closes before the save: an upload must not slip through while
    // the band is being written. Never skipped, whatever follows.
    if (under13) set({ bucket, localOnly: true });
    // The band was forgotten in this run (Erase, account deletion): the ask
    // this answers may have begun before that, and nothing it says reaches
    // the phone's storage or lifts the gate until the next launch asks again.
    if (forgets > 0) return false;
    const forgetsBefore = forgets;
    savedThisRun = true;
    try {
      await saveAgeBucket(bucket);
    } catch (e) {
      // Fails closed: an under-13 band already applies for this run; any
      // other lifts nothing. The message only, never the band.
      // eslint-disable-next-line no-console
      console.warn('[age] could not keep the age range:', e instanceof Error ? e.message : 'unknown error');
      return false;
    }
    if (forgets !== forgetsBefore) {
      // Forgotten while the save ran: the band it wrote goes again, and
      // nothing lifts.
      await clearStoredBand();
      return false;
    }
    if (!under13 && mine === bandVersion) set({ bucket, localOnly: false });
    return true;
  },

  markSettled: () => {
    if (!get().settled) set({ settled: true });
  },

  forgetBand: async () => {
    bandVersion += 1;
    forgets += 1;
    set({ bucket: null });
    // A save of this run may have landed after the caller's wipe; with none
    // started, the wipe left nothing to clear.
    return savedThisRun ? clearStoredBand() : true;
  },
}));

/** Whether the under-13 rule applies now: every upload path checks this first. */
export function isLocalOnly(): boolean {
  return useAgeStore.getState().localOnly;
}

/**
 * Whether automatic uploads at launch (the guest flush, billing's configure)
 * may start: Apple has answered, or uploads don't wait for this launch's ask
 * (`settled`), and the rule doesn't apply.
 */
export function uploadsMayStart(): boolean {
  const { settled, localOnly } = useAgeStore.getState();
  return settled && !localOnly;
}

/** setTimeout's largest delay; a longer one fires at once. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Resolves once Apple has answered on this launch (at once when it already
 * has, or when uploads don't wait for this launch's ask), or after
 * `maxWaitMs` at the latest. With no cap (or a
 * cap that isn't a finite number) it waits for `markSettled` alone. A cap of
 * 0 or less resolves at once. Never rejects, and leaves no timer or
 * subscription behind once it has resolved. Says nothing about the answer:
 * read `isLocalOnly()` afterwards.
 */
export function whenAgeSettled(maxWaitMs?: number): Promise<void> {
  if (useAgeStore.getState().settled) return Promise.resolve();
  const cap =
    typeof maxWaitMs === 'number' && Number.isFinite(maxWaitMs)
      ? Math.min(Math.max(maxWaitMs, 0), MAX_TIMER_MS)
      : null;
  if (cap === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (timer !== null) clearTimeout(timer);
      unsubscribe?.();
      resolve();
    };
    unsubscribe = useAgeStore.subscribe((state) => {
      if (state.settled) finish();
    });
    if (cap !== null) timer = setTimeout(finish, cap);
  });
}

/** Test-only: back to a fresh run's defaults. */
export function __resetAgeStoreForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetAgeStoreForTests is only allowed when NODE_ENV=test');
  }
  bandVersion = 0;
  forgets = 0;
  savedThisRun = false;
  useAgeStore.setState({ ...INITIAL });
}
