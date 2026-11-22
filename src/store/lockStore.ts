// Whether the app is locked right now (roadmap D64, step 180; D74). The
// choice to lock at all is a setting (`settingsStore.appLock`); this is the
// state of one run of the app, and none of it is stored.
//
// When it locks: at launch, and each time the app goes to the background.
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
// on every return the lock screen waits with its line and Unlock, and Face ID
// or the passcode is asked only when Unlock is tapped. The switch in You
// still asks at once (`setEnabled`): that is the person's own tap.
//
// Nor does a prompt that didn't pass reopen itself: one that came back on
// every cancel would be a loop with no way out. The next prompt is always the
// person's next tap on Unlock.

import { create } from 'zustand';

import {
  abandonCheck,
  checkLock,
  lockMethod,
  lockSupport,
  lockSupported,
  type LockMethod,
} from '@/lock/appLock';

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
  /** At launch, once the settings are read: lock if the person chose to. */
  arm: () => void;
  /** The app moved between front, switcher and background. Never asks the phone. */
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

export const useLockStore = create<LockState>((set, get) => ({
  locked: false,
  covered: false,
  checking: false,
  lockSeq: 0,
  notice: null,
  method: null,

  arm: () => {
    if (!lockOn()) return;
    // Locked, and nothing asked: the lock screen waits for Unlock (D74).
    set((s) => ({ locked: true, notice: null, lockSeq: s.lockSeq + 1 }));
    void lockMethod().then((method) => set({ method }));
  },

  appPhaseChanged: (next) => {
    if (next === 'background') {
      // iOS closes its own prompt here. Whatever it was asking is over, the
      // switch's turn-on prompt included: the next one can always be shown,
      // even if this one never answers.
      abandonCheck();
      // Off, or not in this build: nothing locks, and a cover left up goes.
      if (!lockOn()) {
        set({ covered: false });
        return;
      }
      set((s) => ({
        locked: true,
        checking: false,
        notice: null,
        lockSeq: s.lockSeq + 1,
      }));
      // The phone may have gained or lost Face ID while the app was away.
      void lockMethod().then((method) => set({ method }));
      return;
    }
    if (next === 'active') {
      // Back in front: the cover goes. A lock stays up with its Unlock
      // button, and nothing is asked until that is tapped (D74).
      set({ covered: false });
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
    await useSettingsStore.getState().setAppLock(false);
    set({ locked: false, covered: false, checking: false, notice: null });
  },

  setEnabled: async (on) => {
    // Off, however it comes about, leaves nothing locked or covered: the app
    // may have been to the background while the prompt was up.
    const turnOff = async (): Promise<LockChange> => {
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
      await useSettingsStore.getState().setAppLock(true);
      void lockMethod().then((method) => set({ method }));
      return 'changed';
    }
    if (result === 'no_passcode') return on ? 'no_passcode' : turnOff();
    return result === 'cancelled' ? 'cancelled' : 'failed';
  },
}));

/** Test-only: back to an unlocked, unread start. */
export function __resetLockStoreForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetLockStoreForTests is only allowed when NODE_ENV=test');
  }
  useLockStore.setState({
    locked: false,
    covered: false,
    checking: false,
    lockSeq: 0,
    notice: null,
    method: null,
  });
}
