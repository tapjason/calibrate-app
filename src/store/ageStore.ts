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
// of a band that isn't under 13, once that band is saved (`accept`): reading
// the stored band again (`load`) never lifts it, an under-13 answer that
// couldn't be saved still applies for the run, and Erase or account deletion,
// which clear the stored band, leave it on for the run (`forgetBand`, call 4:
// the next launch asks Apple again before anything can be sent).
//
// Defaults, `{ bucket: null, localOnly: false, settled: true }`, are today's
// app: where the question isn't asked (web, Jest, Android, iOS before 26, a
// stored band that isn't under 13) nothing waits and nothing changes.
//
// Layer rule: L4, and a leaf. Imports zustand, @/db/ageBucket,
// @/engine/ageBand and @/types only, so other stores and the services can
// both read it without a require cycle. Never logs a band: an age is
// personal data.

import { create } from 'zustand';

import { saveAgeBucket } from '@/db/ageBucket';
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
   * This launch will ask Apple (iOS 26 with no stored band, or a stored band
   * under 13): `settled` stays false until `markSettled`, so automatic
   * uploads wait for the answer.
   */
  willAsk: boolean;
}

interface AgeState {
  /** The band as this run knows it: the stored one, or Apple's latest answer. Never logged. */
  bucket: AgeBucket | null;
  /** The under-13 rule applies: nothing may leave the phone. Read through `isLocalOnly()`. */
  localOnly: boolean;
  /**
   * Apple has answered on this launch, or this launch doesn't ask. False only
   * between `load(…, { willAsk: true })` and `markSettled()`.
   */
  settled: boolean;

  /**
   * The stored band at launch (`hydrateAgeGate`, src/age/ageRange.ts), before
   * anything can upload: the bucket, `localOnly` from it, and `settled` false
   * when this launch will ask. Fails closed: it turns the gate on, never off
   * (a gate already on in this run stays on until `accept` lifts it).
   */
  load: (bucket: AgeBucket | null, opts: AgeLoadOptions) => void;
  /**
   * Apple's answer: a valid band (src/age/ageRange.ts checks the response).
   * Saved through `saveAgeBucket`, and `localOnly` follows it. An under-13
   * band closes the gate at once, before the save, and keeps it closed for
   * the run even if the save fails. A band that isn't under 13 lifts the gate
   * only once it is saved, and only if no later band or `forgetBand` came in
   * meanwhile: a save that fails lifts nothing, since the stored band (which
   * may be under 13) still stands. Never throws; true when the band was saved.
   */
  accept: (bucket: AgeBucket) => Promise<boolean>;
  /** Apple has answered, or won't on this launch: anything waiting in `whenAgeSettled` goes on. */
  markSettled: () => void;
  /**
   * The stored band was cleared (guest Erase, a confirmed account deletion):
   * `bucket` goes to null, and `localOnly` stays as it is for the rest of the
   * run (call 4). The next launch reads no band and asks Apple again before
   * anything can be sent.
   */
  forgetBand: () => void;
}

const INITIAL = {
  bucket: null as AgeBucket | null,
  localOnly: false,
  settled: true,
};

/**
 * Bumped by every change of band (`load`, `accept`, `forgetBand`), so a save
 * that finishes after a later change lifts nothing.
 */
let bandVersion = 0;

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

  accept: async (bucket) => {
    const mine = ++bandVersion;
    const under13 = isUnder13Band(bucket);
    // The gate closes before the save: an upload must not slip through while
    // the band is being written.
    if (under13) set({ bucket, localOnly: true });
    try {
      await saveAgeBucket(bucket);
    } catch (e) {
      // Fails closed: an under-13 band already applies for this run; any
      // other lifts nothing. The message only, never the band.
      // eslint-disable-next-line no-console
      console.warn('[age] could not keep the age range:', e instanceof Error ? e.message : 'unknown error');
      return false;
    }
    if (!under13 && mine === bandVersion) set({ bucket, localOnly: false });
    return true;
  },

  markSettled: () => {
    if (!get().settled) set({ settled: true });
  },

  forgetBand: () => {
    bandVersion += 1;
    set({ bucket: null });
  },
}));

/** Whether the under-13 rule applies now: every upload path checks this first. */
export function isLocalOnly(): boolean {
  return useAgeStore.getState().localOnly;
}

/**
 * Whether automatic uploads at launch (the guest flush, billing's configure)
 * may start: Apple has answered, or this launch doesn't ask, and the rule
 * doesn't apply.
 */
export function uploadsMayStart(): boolean {
  const { settled, localOnly } = useAgeStore.getState();
  return settled && !localOnly;
}

/** setTimeout's largest delay; a longer one fires at once. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Resolves once Apple has answered on this launch (at once when it already
 * has, or doesn't ask), or after `maxWaitMs` at the latest. With no cap (or a
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
  useAgeStore.setState({ ...INITIAL });
}
