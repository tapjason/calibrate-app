// Whether the app is locked right now (roadmap D64, step 180; D74; D75). The
// choice to lock at all is a setting (`settingsStore.appLock`), and so is how
// long the app may be away first (`settingsStore.appLockGraceMinutes`, "Lock
// after"); this is the state of one run of the app. The one thing kept on the
// phone is when the app went away (`settingsStore.appLockAwaySince`), so a
// restart counts the time away the same.
//
// When it locks (D75, the owner, 2026-11-23: "users should not have to unlock
// the phone if they are already opening the app ... Only if they step away"):
//   - At launch, unless the app went to the background open, with the lock
//     on, no more than the "Lock after" time ago (`arm`).
//   - On a return from the background, by the same rule, decided the moment
//     the app is back in front (`lockOnReturn`, src/engine/lockGrace.ts).
//     Until then the app is covered, so the app switcher never shows it, and
//     the cover comes off in the same update that puts the lock up, so nothing
//     shows for a frame that shouldn't.
//   - With "Lock after" Immediately (0), the moment the app goes to the
//     background, exactly as before D75.
// Every doubt locks: no time away remembered, one that doesn't read, one in
// the future (the clock moved back), a write of it that failed, a settings
// record that couldn't be read. A lock already up stays up whatever the
// time: going away and back never opens it, and going away while locked
// remembers nothing.
//
// Never on "inactive" alone: the app switcher, Notification Center, a system
// alert and iOS's own Face ID prompt all pass through it, and locking there
// would lock again the moment the prompt closed. Inactive only covers the
// screen.
//
// What opens it: a tap on Unlock, and nothing else (D74). The phone used to
// be asked by itself once per lock, the moment the app was next active. The
// owner, after living with it on the iPhone (2026-11-21): "there should be a
// more manual confirmation coming out of locking the app, the face ID should
// not be instant especially if the user is switching back." So at launch and
// on every return that locks, the lock screen waits with its line and Unlock,
// and Face ID or the passcode is asked only when Unlock is tapped. The switch
// in You still asks at once (`setEnabled`): that is the person's own tap.
//
// Nor does a prompt that didn't pass reopen itself: one that came back on
// every cancel would be a loop with no way out. The next prompt is always the
// person's next tap on Unlock.

import { create } from 'zustand';

import { lockOnReturn } from '@/engine/lockGrace';
import {
  abandonCheck,
  checkLock,
  lockMethod,
  lockSupport,
  lockSupported,
  type LockMethod,
} from '@/lock/appLock';
import { isLockGraceMinutes } from '@/types';

import { useSettingsStore } from './settingsStore';

/**
 * What iOS shows in its own prompt. Without the app's name: iOS puts it
 * before the reason itself (Apple's LocalAuthentication guidance).
 */
export const UNLOCK_REASON = 'Unlock the app';
export const LOCK_ON_REASON = 'Turn on the app lock';
export const LOCK_OFF_REASON = 'Turn off the app lock';

/** How a tap on the switch in You ended. */
export type LockChange =
  | 'changed'
  /** The prompt was closed: nothing changed, nothing to say. */
  | 'cancelled'
  /** The phone has no passcode, so there is nothing to lock with. */
  | 'no_passcode'
  /** The check didn't pass, or couldn't run: nothing changed. */
  | 'failed';

/** The app's own state names, so this file needs nothing from react-native. */
type AppPhase = 'active' | 'inactive' | 'background' | 'unknown' | 'extension';

interface LockState {
  /** The lock screen is up. */
  locked: boolean;
  /** The app isn't in front while the lock is on: its content is covered. */
  covered: boolean;
  /** A prompt is up. */
  checking: boolean;
  /**
   * Counts each time the app locks. A prompt answers for the lock it was
   * shown for: a pass that arrives after the app has been to the background
   * again doesn't open the newer lock.
   */
  lockSeq: number;
  /** What the lock screen has to say beyond "Locked". */
  notice: 'no_passcode' | 'failed' | null;
  /** How this phone unlocks, for the words; null until read. */
  method: LockMethod | null;
  /**
   * At launch, once the settings are read: lock if the person chose to,
   * unless the app went away open no more than "Lock after" ago (D75).
   * Synchronous: the time away is read with the settings.
   */
  arm: () => void;
  /**
   * The app moved between front, switcher and background. Never asks the
   * phone. A return from the background is decided here (D75); calling it
   * again with 'active' only uncovers, so a second listener can call it first.
   */
  appPhaseChanged: (next: AppPhase) => void;
  /** A tap on Unlock: ask the phone. Passing opens the app. */
  unlock: () => Promise<void>;
  /** The phone has no passcode any more: turn the lock off and open. */
  continueWithoutLock: () => Promise<void>;
  /** The switch in You: checks with the phone before changing either way. */
  setEnabled: (on: boolean) => Promise<LockChange>;
}

/** Whether the person chose a lock and this build can keep it. */
function lockOn(): boolean {
  return useSettingsStore.getState().appLock && lockSupported();
}

/**
 * "Lock after", in minutes. One that isn't a choice reads as 0, Immediately:
 * the side that locks.
 */
function graceMinutes(): number {
  const grace = useSettingsStore.getState().appLockGraceMinutes;
  return isLockGraceMinutes(grace) ? grace : 0;
}

/**
 * A trip away while the lock is on and open (D75): from the moment the app
 * went to the background until it is next in front. `failed` once the write
 * of `since` to the phone didn't land, which makes the return lock.
 */
interface Trip {
  since: string;
  failed: boolean;
}

/** The trip under way, or null. In memory: the phone's copy is for a restart. */
let trip: Trip | null = null;

/** Keep the trip's start on the phone. A write that fails or throws marks it. */
function rememberAway(t: Trip): void {
  void (async () => {
    let landed = false;
    try {
      landed = await useSettingsStore.getState().setAppLockAwaySince(t.since);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[lock] could not keep when the app went away:', e instanceof Error ? e.message : 'unknown error');
    }
    if (!landed) t.failed = true;
  })();
}

/**
 * Forget the time away kept on the phone, if there is one: the trip is over,
 * or the lock came up. Never throws.
 */
function forgetAway(): void {
  void (async () => {
    try {
      if (useSettingsStore.getState().appLockAwaySince === null) return;
      await useSettingsStore.getState().setAppLockAwaySince(null);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[lock] could not forget when the app went away:', e instanceof Error ? e.message : 'unknown error');
    }
  })();
}

/** Read how this phone unlocks, for the lock screen's words. */
function readMethod(): void {
  void lockMethod().then((method) => useLockStore.setState({ method }));
}

export const useLockStore = create<LockState>((set, get) => ({
  locked: false,
  covered: false,
  checking: false,
  lockSeq: 0,
  notice: null,
  method: null,

  arm: () => {
    if (!lockOn()) return;
    readMethod();
    const settings = useSettingsStore.getState();
    // A record that couldn't be read says nothing about the time away.
    const awaySince = settings.loadFailed ? null : settings.appLockAwaySince;
    const lockNow = lockOnReturn({
      graceMinutes: settings.appLockGraceMinutes,
      awaySince,
      now: Date.now(),
      alreadyLocked: get().locked,
    });
    if (lockNow || awaySince === null) {
      trip = null;
      // Locked, and nothing asked: the lock screen waits for Unlock (D74).
      set((s) => ({ locked: true, notice: null, lockSeq: s.lockSeq + 1 }));
      forgetAway();
      return;
    }
    // Back within "Lock after", after a restart: open. The trip goes on
    // until the app is first in front, where it is decided once more and
    // forgotten; a launch into the background keeps its start.
    trip = { since: awaySince, failed: false };
  },

  appPhaseChanged: (next) => {
    if (next === 'background') {
      // iOS closes its own prompt here. Whatever it was asking is over, the
      // switch's turn-on prompt included: the next one can always be shown,
      // even if this one never answers.
      abandonCheck();
      // Off, or not in this build: nothing locks, and a cover left up goes.
      if (!lockOn()) {
        trip = null;
        set({ covered: false });
        return;
      }
      // The phone may have gained or lost Face ID while the app was away.
      readMethod();
      // Already away with no return between (or a launch that opened and
      // never came to the front): the trip keeps the time it began.
      if (trip !== null) {
        set({ covered: true });
        return;
      }
      // Immediately, or a lock already up: locked now, as before D75, and
      // nothing remembered. A lock once up opens only on Unlock (D74).
      if (get().locked || graceMinutes() === 0) {
        set((s) => ({
          locked: true,
          checking: false,
          notice: null,
          lockSeq: s.lockSeq + 1,
        }));
        forgetAway();
        return;
      }
      // Open, with time to come back (D75): covered, so the app switcher
      // shows only the name, and when it left kept on the phone.
      const t: Trip = { since: new Date(Date.now()).toISOString(), failed: false };
      trip = t;
      set({ covered: true, checking: false, notice: null });
      rememberAway(t);
      return;
    }
    if (next === 'active') {
      const t = trip;
      trip = null;
      if (t === null) {
        // Back in front: the cover goes. A lock stays up with its Unlock
        // button, and nothing is asked until that is tapped (D74).
        set({ covered: false });
        return;
      }
      // Back from a trip away (D75): decided now, and the cover comes off
      // in the same update that puts the lock up, so the content never
      // shows for a frame when it should be locked.
      const settings = useSettingsStore.getState();
      const wasLocked = get().locked;
      const lockNow =
        lockOn() &&
        lockOnReturn({
          graceMinutes: settings.appLockGraceMinutes,
          awaySince: t.failed ? null : t.since,
          now: Date.now(),
          alreadyLocked: wasLocked,
        });
      if (lockNow && !wasLocked) {
        set((s) => ({
          covered: false,
          locked: true,
          checking: false,
          notice: null,
          lockSeq: s.lockSeq + 1,
        }));
        readMethod();
      } else {
        set({ covered: false });
      }
      forgetAway();
      return;
    }
    // Inactive (and the states iOS never sends an app): cover, don't lock.
    set({ covered: lockOn() });
  },

  unlock: async () => {
    if (!get().locked || get().checking) return;
    // The lock was turned off while this screen was up: nothing to ask.
    if (!lockOn()) {
      set({ locked: false, covered: false, notice: null });
      return;
    }
    const seq = get().lockSeq;
    // The notice goes while the phone is asked, so the same one is said
    // again if this check fails too.
    set({ checking: true, notice: null });
    const result = await checkLock(UNLOCK_REASON);
    // A pass always opens, whatever happened meanwhile. Nobody knows yet
    // whether iOS's passcode screen sends the app to the background: if it
    // does and a pass were dropped for arriving "after" that, every passcode
    // would be asked for again, with no way in (code review, round 2).
    if (result === 'passed') {
      set({ checking: false, locked: false, notice: null });
      return;
    }
    // Anything else from before the app last went away says nothing about
    // the lock that is up now, which waits for its own tap on Unlock.
    if (get().lockSeq !== seq) return;
    set({
      checking: false,
      notice: result === 'no_passcode' ? 'no_passcode' : result === 'failed' ? 'failed' : null,
    });
  },

  continueWithoutLock: async () => {
    // Only from the notice that the phone has nothing to check against.
    if (get().notice !== 'no_passcode') return;
    trip = null;
    // Forgets the time away too (`setAppLock`).
    await useSettingsStore.getState().setAppLock(false);
    set({ locked: false, covered: false, checking: false, notice: null });
  },

  setEnabled: async (on) => {
    // Off, however it comes about, leaves nothing locked or covered: the app
    // may have been to the background while the prompt was up.
    const turnOff = async (): Promise<LockChange> => {
      trip = null;
      await useSettingsStore.getState().setAppLock(false);
      set({ locked: false, covered: false, checking: false, notice: null });
      return 'changed';
    };
    const support = await lockSupport();
    if (support === 'unsupported') return 'failed';
    // Nothing to check against. Off is always allowed: a lock the phone
    // can't keep shouldn't stay switched on.
    if (support === 'no_passcode') return on ? 'no_passcode' : turnOff();
    const result = await checkLock(on ? LOCK_ON_REASON : LOCK_OFF_REASON);
    if (result === 'passed') {
      if (!on) return turnOff();
      // On leaves the app open, as it is now, and forgets any time away
      // from before (`setAppLock`, D75).
      trip = null;
      await useSettingsStore.getState().setAppLock(true);
      readMethod();
      return 'changed';
    }
    if (result === 'no_passcode') return on ? 'no_passcode' : turnOff();
    return result === 'cancelled' ? 'cancelled' : 'failed';
  },
}));

/** Test-only: back to an unlocked, unread start, with no trip away. */
export function __resetLockStoreForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetLockStoreForTests is only allowed when NODE_ENV=test');
  }
  trip = null;
  useLockStore.setState({
    locked: false,
    covered: false,
    checking: false,
    lockSeq: 0,
    notice: null,
    method: null,
  });
}
