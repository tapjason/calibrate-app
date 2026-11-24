// When the app locks and what opens it (roadmap D64, step 180). Since D74
// (the owner, 2026-11-21) only a tap on Unlock asks the phone: nothing asks
// by itself at launch or on a return from the background. Since D75 (the
// owner, 2026-11-23) a return within "Lock after" of leaving opens straight
// in; Immediately (0) locks on every trip to the background, as before.

import { __setLockDepsForTests, type LockDeps } from '@/lock/appLock';
import type { LockGraceMinutes } from '@/types';

import {
  __resetLockStoreForTests,
  LOCK_OFF_REASON,
  LOCK_ON_REASON,
  UNLOCK_REASON,
  useLockStore,
} from './lockStore';
import { __setPersistenceForTests, useSettingsStore, type StoredSettings } from './settingsStore';

type Result = { success: boolean; error?: string };

let answers: Result[];
let authenticateAsync: jest.Mock<Promise<Result>, [{ promptMessage: string }]>;
let level: number;

function install(): void {
  const deps: LockDeps = {
    getEnrolledLevelAsync: async () => level,
    supportedAuthenticationTypesAsync: async () => [2],
    authenticateAsync,
  };
  __setLockDepsForTests(deps);
}

/** Let the store's un-awaited prompt run to its end. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

/** Prompts that answer only when the test says so, in the order they opened. */
function heldPrompts(): Array<(r: Result) => void> {
  const finishers: Array<(r: Result) => void> = [];
  authenticateAsync = jest.fn(
    (_options: { promptMessage: string }) =>
      new Promise<Result>((resolve) => {
        finishers.push(resolve);
      }),
  );
  install();
  return finishers;
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  answers = [];
  level = 3;
  authenticateAsync = jest.fn(async (_options: { promptMessage: string }) => answers.shift() ?? { success: true });
  install();
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  __resetLockStoreForTests();
});

afterEach(() => {
  __setLockDepsForTests(undefined);
  __setPersistenceForTests(null);
  jest.restoreAllMocks();
});

const lock = () => useLockStore.getState();
/** The lock on, with "Lock after" at its default, 5 minutes. */
const on = () => useSettingsStore.setState({ appLock: true });
/** The lock on, locking the moment the app goes away: the lock screen itself. */
const onImmediately = () => useSettingsStore.setState({ appLock: true, appLockGraceMinutes: 0 });

describe('lockStore: at launch', () => {
  it('stays open when the person never chose a lock', async () => {
    lock().arm();
    expect(lock().locked).toBe(false);
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).not.toHaveBeenCalled();
  });

  it('locks, and asks nothing when the app is active', async () => {
    on();
    lock().arm();
    expect(lock().locked).toBe(true);
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).not.toHaveBeenCalled();
    expect(lock().locked).toBe(true);
    expect(lock().covered).toBe(false);
    expect(lock().checking).toBe(false);
    expect(lock().method).toBe('Face ID');
  });

  it('asks once when Unlock is tapped, and opens on a pass', async () => {
    on();
    lock().arm();
    lock().appPhaseChanged('active');
    await settle();
    await lock().unlock();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    expect(authenticateAsync.mock.calls[0][0].promptMessage).toBe(UNLOCK_REASON);
    expect(lock().locked).toBe(false);
  });

  // A build made before the package was added: a lock nobody can open is
  // worse than none.
  it('never locks on a build without the module', () => {
    on();
    __setLockDepsForTests(null);
    lock().arm();
    expect(lock().locked).toBe(false);
    lock().appPhaseChanged('background');
    expect(lock().locked).toBe(false);
    lock().appPhaseChanged('inactive');
    expect(lock().covered).toBe(false);
  });
});

// Security review, 2026-11-18: a settings record that couldn't be read
// turned the lock off. Launch now locks where the build can, the way
// app/_layout.tsx runs it: hydrate, then arm.
describe('lockStore: at launch after the settings', () => {
  async function launchWith(load: () => Promise<unknown>) {
    const saved: Array<{ appLock: boolean }> = [];
    __setPersistenceForTests({
      load: load as () => Promise<null>,
      save: async (settings) => {
        saved.push(settings);
      },
    });
    await useSettingsStore.getState().hydrate();
    lock().arm();
    return saved;
  }

  it('a fresh install, with no settings yet, opens with no lock', async () => {
    await launchWith(async () => null);
    expect(lock().locked).toBe(false);
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).not.toHaveBeenCalled();
  });

  it('a corrupt settings record locks, and Face ID or the passcode opens it on a tap', async () => {
    await launchWith(async () => 'not a settings object');
    expect(lock().locked).toBe(true);
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).not.toHaveBeenCalled();
    await lock().unlock();
    expect(authenticateAsync.mock.calls[0][0].promptMessage).toBe(UNLOCK_REASON);
    expect(lock().locked).toBe(false);
  });

  it('a read that throws locks', async () => {
    await launchWith(async () => {
      throw new Error('storage unavailable');
    });
    expect(lock().locked).toBe(true);
  });

  it('never locks after a failed read on a build without the module', async () => {
    __setLockDepsForTests(null);
    await launchWith(async () => {
      throw new Error('storage unavailable');
    });
    expect(lock().locked).toBe(false);
  });

  it('turning the lock off afterwards works as usual, and is stored', async () => {
    const saved = await launchWith(async () => {
      throw new Error('storage unavailable');
    });
    lock().appPhaseChanged('active');
    await lock().unlock();
    expect(lock().locked).toBe(false);

    expect(await lock().setEnabled(false)).toBe('changed');
    expect(authenticateAsync.mock.calls[1][0].promptMessage).toBe(LOCK_OFF_REASON);
    expect(useSettingsStore.getState().appLock).toBe(false);
    expect(saved[saved.length - 1].appLock).toBe(false);
    // And leaving the app no longer locks it.
    lock().appPhaseChanged('background');
    expect(lock().locked).toBe(false);
  });

  it('a phone with no passcode is offered Continue, as when its passcode was removed', async () => {
    answers = [{ success: false, error: 'passcode_not_set' }];
    await launchWith(async () => {
      throw new Error('storage unavailable');
    });
    lock().appPhaseChanged('active');
    await lock().unlock();
    expect(lock().notice).toBe('no_passcode');
    await lock().continueWithoutLock();
    expect(lock().locked).toBe(false);
    expect(useSettingsStore.getState().appLock).toBe(false);
  });
});

describe('lockStore: in and out of the foreground', () => {
  it('covers on inactive without locking, and uncovers on return', () => {
    on();
    lock().appPhaseChanged('inactive');
    expect(lock().covered).toBe(true);
    expect(lock().locked).toBe(false);
    lock().appPhaseChanged('active');
    expect(lock().covered).toBe(false);
    expect(authenticateAsync).not.toHaveBeenCalled();
  });

  it('covers nothing while the lock is off', () => {
    lock().appPhaseChanged('inactive');
    expect(lock().covered).toBe(false);
    lock().appPhaseChanged('background');
    expect(lock().locked).toBe(false);
  });

  // D74: switching back opens on the lock screen, not on Face ID. With "Lock
  // after" Immediately (D75), as every trip away did before it.
  it('with Lock after Immediately, locks on the background, and on return uncovers and waits for Unlock', async () => {
    onImmediately();
    lock().appPhaseChanged('inactive');
    lock().appPhaseChanged('background');
    expect(lock().locked).toBe(true);
    lock().appPhaseChanged('inactive');
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).not.toHaveBeenCalled();
    expect(lock().locked).toBe(true);
    expect(lock().covered).toBe(false);
    expect(lock().checking).toBe(false);
    await lock().unlock();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    expect(lock().locked).toBe(false);
  });

  it('asks nothing by itself however often the app comes and goes', async () => {
    on();
    lock().arm();
    for (const phase of ['active', 'inactive', 'background', 'inactive', 'active', 'background', 'active'] as const) {
      lock().appPhaseChanged(phase);
      await settle();
    }
    expect(authenticateAsync).not.toHaveBeenCalled();
    expect(lock().locked).toBe(true);
  });

  // iOS's own prompt can send the app through inactive and back: a prompt
  // that reopened itself on every cancel would be a loop.
  it('does not ask again by itself after a prompt that was closed, and a later tap asks again', async () => {
    on();
    answers = [{ success: false, error: 'user_cancel' }];
    lock().arm();
    lock().appPhaseChanged('active');
    await lock().unlock();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    expect(lock().locked).toBe(true);
    // Closing the prompt isn't a failure: nothing more is said.
    expect(lock().notice).toBeNull();
    lock().appPhaseChanged('inactive');
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    await lock().unlock();
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
    expect(lock().locked).toBe(false);
  });

  it('after a closed prompt and a trip away, waits for a tap again', async () => {
    on();
    answers = [{ success: false, error: 'system_cancel' }];
    lock().arm();
    lock().appPhaseChanged('active');
    await lock().unlock();
    lock().appPhaseChanged('background');
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    expect(lock().locked).toBe(true);
    await lock().unlock();
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
    expect(lock().locked).toBe(false);
  });

  it('says a check failed, stays locked, and a later tap asks again', async () => {
    on();
    answers = [{ success: false, error: 'not_available' }];
    lock().arm();
    lock().appPhaseChanged('active');
    await lock().unlock();
    expect(lock().locked).toBe(true);
    expect(lock().notice).toBe('failed');
    lock().appPhaseChanged('inactive');
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    await lock().unlock();
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
    expect(lock().locked).toBe(false);
    expect(lock().notice).toBeNull();
  });

  it('shows one prompt at a time: a second tap while one is up is ignored', async () => {
    on();
    const finishers = heldPrompts();
    lock().arm();
    lock().appPhaseChanged('active');
    void lock().unlock();
    void lock().unlock();
    expect(lock().checking).toBe(true);
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    finishers[0]({ success: true });
    await settle();
    expect(lock().checking).toBe(false);
    expect(lock().locked).toBe(false);
  });

  // iOS closes its prompt when the app goes away. Coming back shows the lock
  // screen with Unlock ready, and nothing is asked until it is tapped.
  it('after going away during a prompt, stays locked on return with no new prompt until a tap', async () => {
    on();
    const finishers = heldPrompts();
    lock().arm();
    lock().appPhaseChanged('active');
    void lock().unlock();
    await settle();
    expect(lock().checking).toBe(true);
    lock().appPhaseChanged('background');
    expect(lock().checking).toBe(false);
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    expect(lock().locked).toBe(true);
    expect(lock().checking).toBe(false);
    void lock().unlock();
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
    finishers[1]({ success: true });
    await settle();
    expect(lock().locked).toBe(false);
  });
});

// Removing a passcode takes the passcode, so this is the one failure that
// opens the app; the person is told, and the lock is turned off.
describe('lockStore: a phone that lost its passcode', () => {
  it('says so on Unlock, and Continue turns the lock off and opens', async () => {
    on();
    answers = [{ success: false, error: 'passcode_not_set' }];
    lock().arm();
    lock().appPhaseChanged('active');
    await lock().unlock();
    expect(lock().locked).toBe(true);
    expect(lock().notice).toBe('no_passcode');
    await lock().continueWithoutLock();
    expect(lock().locked).toBe(false);
    expect(useSettingsStore.getState().appLock).toBe(false);
  });

  it('Continue does nothing on any other failure', async () => {
    on();
    answers = [{ success: false, error: 'not_available' }];
    lock().arm();
    lock().appPhaseChanged('active');
    await lock().unlock();
    await lock().continueWithoutLock();
    expect(lock().locked).toBe(true);
    expect(useSettingsStore.getState().appLock).toBe(true);
  });
});

describe('lockStore: the switch in You', () => {
  it('turns on only after the phone has checked, and does not lock at once', async () => {
    expect(await lock().setEnabled(true)).toBe('changed');
    expect(authenticateAsync.mock.calls[0][0].promptMessage).toBe(LOCK_ON_REASON);
    expect(useSettingsStore.getState().appLock).toBe(true);
    expect(lock().locked).toBe(false);
  });

  it('stays off when the prompt is closed or fails', async () => {
    answers = [
      { success: false, error: 'user_cancel' },
      { success: false, error: 'lockout' },
    ];
    expect(await lock().setEnabled(true)).toBe('cancelled');
    expect(await lock().setEnabled(true)).toBe('failed');
    expect(useSettingsStore.getState().appLock).toBe(false);
  });

  it('turns off only after the phone has checked', async () => {
    on();
    answers = [{ success: false, error: 'user_cancel' }, { success: true }];
    expect(await lock().setEnabled(false)).toBe('cancelled');
    expect(useSettingsStore.getState().appLock).toBe(true);
    expect(await lock().setEnabled(false)).toBe('changed');
    expect(authenticateAsync.mock.calls[1][0].promptMessage).toBe(LOCK_OFF_REASON);
    expect(useSettingsStore.getState().appLock).toBe(false);
  });

  it('cannot be turned on without a passcode, and can always be turned off', async () => {
    level = 0;
    expect(await lock().setEnabled(true)).toBe('no_passcode');
    expect(useSettingsStore.getState().appLock).toBe(false);
    expect(authenticateAsync).not.toHaveBeenCalled();
    on();
    expect(await lock().setEnabled(false)).toBe('changed');
    expect(useSettingsStore.getState().appLock).toBe(false);
  });

  it('changes nothing on a build without the module', async () => {
    __setLockDepsForTests(null);
    expect(await lock().setEnabled(true)).toBe('failed');
    expect(useSettingsStore.getState().appLock).toBe(false);
  });
});

// Code review of step 180.
describe('lockStore: the edges', () => {
  it('asks in iOS’s prompt without the app’s name, which iOS adds itself', () => {
    for (const reason of [UNLOCK_REASON, LOCK_ON_REASON, LOCK_OFF_REASON]) {
      expect(reason).not.toMatch(/Fairly Sure/);
    }
  });

  // Nobody knows yet whether iOS's passcode screen sends the app to the
  // background. If it does, a pass dropped for arriving "after" that would be
  // asked for again every time, with no way in (code review, round 2).
  it('opens on a pass even if the app went to the background while the prompt was up', async () => {
    on();
    const finishers = heldPrompts();
    lock().arm();
    lock().appPhaseChanged('active');
    void lock().unlock();
    await settle();
    expect(lock().checking).toBe(true);
    // The passcode screen, if it backgrounds the app: locked again meanwhile.
    lock().appPhaseChanged('background');
    expect(lock().checking).toBe(false);
    finishers[0]({ success: true });
    await settle();
    expect(lock().locked).toBe(false);
    // Back in front: nothing is asked a second time.
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
  });

  // A late answer that isn't a pass says nothing about the lock that is up now.
  it('ignores a late failure from before the app went away', async () => {
    on();
    const finishers = heldPrompts();
    lock().arm();
    lock().appPhaseChanged('active');
    void lock().unlock();
    await settle();
    lock().appPhaseChanged('background');
    lock().appPhaseChanged('active');
    // The person taps Unlock on the new lock.
    void lock().unlock();
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
    expect(lock().checking).toBe(true);
    // The first prompt reports a failure late: the second is still up.
    finishers[0]({ success: false, error: 'not_available' });
    await settle();
    expect(lock().checking).toBe(true);
    expect(lock().notice).toBeNull();
    finishers[1]({ success: true });
    await settle();
    expect(lock().locked).toBe(false);
  });

  // A second failure in a row is said again: the notice goes while asking.
  it('clears the notice while the phone is asked again', async () => {
    on();
    answers = [{ success: false, error: 'not_available' }];
    lock().arm();
    lock().appPhaseChanged('active');
    await lock().unlock();
    expect(lock().notice).toBe('failed');
    const finishers = heldPrompts();
    const again = lock().unlock();
    expect(lock().notice).toBeNull();
    finishers[0]({ success: false, error: 'not_available' });
    await again;
    expect(lock().notice).toBe('failed');
  });

  // The switch's own prompt, with the lock still off, must not hold the next one.
  it('drops a turn-on prompt that never answers when the app goes away', async () => {
    authenticateAsync = jest.fn(
      (_options: { promptMessage: string }) => new Promise<Result>(() => {}),
    );
    install();
    void lock().setEnabled(true);
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    lock().appPhaseChanged('background');
    lock().appPhaseChanged('active');
    void lock().setEnabled(true);
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
  });

  // A prompt that never answers at all: after leaving and coming back, a tap
  // on Unlock still asks.
  it('a tap asks again on return even if the last prompt never answered', async () => {
    on();
    authenticateAsync = jest.fn(
      (_options: { promptMessage: string }) => new Promise<Result>(() => {}),
    );
    install();
    lock().arm();
    lock().appPhaseChanged('active');
    void lock().unlock();
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    lock().appPhaseChanged('background');
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    void lock().unlock();
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
  });

  it('opens at once when the lock was turned off while the screen was up', async () => {
    on();
    lock().arm();
    useSettingsStore.setState({ appLock: false });
    await lock().unlock();
    expect(lock().locked).toBe(false);
    expect(authenticateAsync).not.toHaveBeenCalled();
  });

  // The app went to the background while "Turn off the app lock" was up.
  it('leaves nothing locked when the lock is turned off', async () => {
    on();
    const finishers = heldPrompts();
    const change = lock().setEnabled(false);
    await settle();
    useLockStore.setState({ locked: true, covered: true });
    finishers[0]({ success: true });
    expect(await change).toBe('changed');
    expect(useSettingsStore.getState().appLock).toBe(false);
    expect(lock().locked).toBe(false);
    expect(lock().covered).toBe(false);
  });
});

// Roadmap D75 (the owner, 2026-11-23): "users should not have to unlock the
// phone if they are already opening the app ... Only if they step away."
// Fake time throughout: Date.now is the test's clock.
describe('lockStore: Lock after (D75)', () => {
  const T0 = Date.parse('2026-11-23T10:00:00.000Z');
  const MIN = 60_000;
  const iso = (ms: number) => new Date(ms).toISOString();
  let clock: number;
  const advance = (ms: number) => {
    clock += ms;
  };
  /** Let every write the store started finish. */
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  /** A settings record on "disk": what was stored, and every write. */
  function record(
    initial: Partial<StoredSettings> | null = null,
    options: { loadThrows?: boolean; saveThrows?: boolean } = {},
  ) {
    let stored = initial;
    const saved: StoredSettings[] = [];
    __setPersistenceForTests({
      load: async () => {
        if (options.loadThrows) throw new Error('read failed');
        return stored;
      },
      save: async (next) => {
        if (options.saveThrows) throw new Error('write failed');
        saved.push(next);
        stored = next;
      },
    });
    return { saved, stored: () => stored };
  }

  /** Launch as app/_layout.tsx does: the settings, then arm. */
  async function launch(initial: Partial<StoredSettings> | null, options?: { loadThrows?: boolean }) {
    const rec = record(initial, options);
    await useSettingsStore.getState().hydrate();
    lock().arm();
    return rec;
  }

  const withGrace = (grace: LockGraceMinutes) =>
    useSettingsStore.setState({ appLock: true, appLockGraceMinutes: grace });

  beforeEach(() => {
    clock = T0;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
  });

  describe('a trip away while open', () => {
    it('with the default 5 minutes, covers without locking, and a return inside opens straight in', async () => {
      const rec = record();
      on();
      lock().appPhaseChanged('inactive');
      lock().appPhaseChanged('background');
      expect(lock().covered).toBe(true);
      expect(lock().locked).toBe(false);
      await flush();
      // Kept on the phone, so a restart counts the same time away.
      expect(rec.stored()?.appLockAwaySince).toBe(iso(T0));

      advance(4 * MIN);
      lock().appPhaseChanged('inactive');
      expect(lock().covered).toBe(true);
      lock().appPhaseChanged('active');
      expect(lock().covered).toBe(false);
      expect(lock().locked).toBe(false);
      expect(lock().lockSeq).toBe(0);
      await flush();
      expect(authenticateAsync).not.toHaveBeenCalled();
      // The trip is over: forgotten.
      expect(rec.stored()?.appLockAwaySince).toBeNull();
    });

    it('a return outside locks, in the same update that takes the cover off', async () => {
      const rec = record();
      on();
      lock().appPhaseChanged('inactive');
      lock().appPhaseChanged('background');
      await flush();

      const seen: Array<{ locked: boolean; covered: boolean }> = [];
      const unsubscribe = useLockStore.subscribe((s) => {
        seen.push({ locked: s.locked, covered: s.covered });
      });
      advance(5 * MIN + 1);
      lock().appPhaseChanged('inactive');
      lock().appPhaseChanged('active');
      unsubscribe();

      // Never uncovered and open on the way: the content never showed.
      expect(seen.some((s) => !s.locked && !s.covered)).toBe(false);
      expect(seen[seen.length - 1]).toEqual({ locked: true, covered: false });
      expect(lock().lockSeq).toBe(1);
      expect(lock().checking).toBe(false);
      await flush();
      // Waits for Unlock (D74), and the time away is forgotten.
      expect(authenticateAsync).not.toHaveBeenCalled();
      expect(rec.stored()?.appLockAwaySince).toBeNull();
      await lock().unlock();
      expect(lock().locked).toBe(false);
    });

    it.each<LockGraceMinutes>([1, 5, 15])(
      'with %i minutes, back exactly at the limit opens, and 1 ms over locks',
      async (grace) => {
        record();
        withGrace(grace);
        lock().appPhaseChanged('background');
        advance(grace * MIN);
        lock().appPhaseChanged('active');
        expect(lock().locked).toBe(false);

        lock().appPhaseChanged('background');
        advance(grace * MIN + 1);
        lock().appPhaseChanged('active');
        expect(lock().locked).toBe(true);
      },
    );

    it('times the trip from when the app went to the background, not from inactive', async () => {
      const rec = record();
      on();
      lock().appPhaseChanged('inactive');
      await flush();
      expect(rec.saved).toHaveLength(0);
      advance(3 * MIN);
      lock().appPhaseChanged('background');
      await flush();
      expect(rec.stored()?.appLockAwaySince).toBe(iso(T0 + 3 * MIN));
      advance(5 * MIN);
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(false);
    });

    it('inactive alone covers and never locks, however long it lasts', () => {
      record();
      on();
      lock().appPhaseChanged('inactive');
      advance(60 * MIN);
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(false);
      expect(lock().covered).toBe(false);
    });

    it('a second background with no return between keeps the time the trip began', async () => {
      record();
      on();
      lock().appPhaseChanged('background');
      advance(4 * MIN);
      lock().appPhaseChanged('background');
      expect(lock().covered).toBe(true);
      advance(2 * MIN);
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(true);
    });

    it('a time away clocked in the future (the clock moved back) locks', () => {
      record();
      on();
      lock().appPhaseChanged('background');
      advance(-1);
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(true);
    });

    it('a write of the time away that fails locks the return', async () => {
      record(null, { saveThrows: true });
      on();
      lock().appPhaseChanged('background');
      await flush();
      advance(MIN);
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(true);
    });

    it('decides a return once: a second active only uncovers', () => {
      record();
      on();
      lock().appPhaseChanged('background');
      advance(6 * MIN);
      lock().appPhaseChanged('active');
      expect(lock().lockSeq).toBe(1);
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(true);
      expect(lock().lockSeq).toBe(1);
    });
  });

  describe('Immediately (0)', () => {
    it('locks the moment the app goes to the background, as before, and remembers no time away', async () => {
      const rec = record();
      onImmediately();
      lock().appPhaseChanged('inactive');
      expect(lock().locked).toBe(false);
      lock().appPhaseChanged('background');
      expect(lock().locked).toBe(true);
      expect(lock().lockSeq).toBe(1);
      await flush();
      expect(rec.saved.every((s) => s.appLockAwaySince === null)).toBe(true);
      // Back at once: still locked, waiting for Unlock.
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(true);
      expect(lock().covered).toBe(false);
      await lock().unlock();
      expect(lock().locked).toBe(false);
    });

    it('locks at launch even with a time away a moment ago', async () => {
      await launch({ appLock: true, appLockGraceMinutes: 0, appLockAwaySince: iso(T0) });
      expect(lock().locked).toBe(true);
    });
  });

  describe('a lock already up', () => {
    it.each<LockGraceMinutes>([0, 1, 5, 15])(
      'with %i minutes, stays up across a trip away and back, and remembers no time away',
      async (grace) => {
        const rec = record();
        withGrace(grace);
        lock().arm();
        expect(lock().locked).toBe(true);
        lock().appPhaseChanged('active');
        lock().appPhaseChanged('inactive');
        lock().appPhaseChanged('background');
        await flush();
        advance(1);
        lock().appPhaseChanged('active');
        expect(lock().locked).toBe(true);
        await flush();
        expect(authenticateAsync).not.toHaveBeenCalled();
        // Never written or refreshed while locked.
        expect(rec.saved.every((s) => s.appLockAwaySince === null)).toBe(true);
        expect(useSettingsStore.getState().appLockAwaySince).toBeNull();
      },
    );

    it('going away while locked does not refresh an earlier time away', async () => {
      // A trip that locked on return: what it kept is forgotten, never renewed.
      const rec = record();
      on();
      lock().appPhaseChanged('background');
      advance(10 * MIN);
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(true);
      await flush();
      lock().appPhaseChanged('background');
      await flush();
      expect(rec.stored()?.appLockAwaySince).toBeNull();
      // Even a launch a moment later locks.
      advance(1);
      __resetLockStoreForTests();
      await launch(rec.stored());
      expect(lock().locked).toBe(true);
    });
  });

  describe('at launch', () => {
    it('opens inside the window after a restart, and forgets the time away once in front', async () => {
      const rec = await launch({ appLock: true, appLockAwaySince: iso(T0 - 4 * MIN) });
      expect(lock().locked).toBe(false);
      expect(lock().covered).toBe(false);
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(false);
      await flush();
      expect(rec.stored()?.appLockAwaySince).toBeNull();
      expect(authenticateAsync).not.toHaveBeenCalled();
    });

    it('opens exactly at the limit, and locks 1 ms over', async () => {
      await launch({ appLock: true, appLockGraceMinutes: 5, appLockAwaySince: iso(T0 - 5 * MIN) });
      expect(lock().locked).toBe(false);

      __resetLockStoreForTests();
      const rec = await launch({ appLock: true, appLockGraceMinutes: 5, appLockAwaySince: iso(T0 - 5 * MIN - 1) });
      expect(lock().locked).toBe(true);
      expect(lock().lockSeq).toBe(1);
      await flush();
      expect(rec.stored()?.appLockAwaySince).toBeNull();
    });

    it('uses 5 minutes for a lock turned on before D75, and for a stored grace that is not a choice', async () => {
      await launch({ appLock: true, appLockAwaySince: iso(T0 - 4 * MIN) });
      expect(lock().locked).toBe(false);

      __resetLockStoreForTests();
      await launch({
        appLock: true,
        appLockGraceMinutes: 7 as unknown as LockGraceMinutes,
        appLockAwaySince: iso(T0 - 4 * MIN),
      });
      expect(useSettingsStore.getState().appLockGraceMinutes).toBe(5);
      expect(lock().locked).toBe(false);
    });

    it.each<[string, Partial<StoredSettings>]>([
      ['no time away', { appLock: true }],
      ['a time away that does not read', { appLock: true, appLockAwaySince: 'a minute ago' }],
      ['a time away in the future', { appLock: true, appLockAwaySince: iso(T0 + 1) }],
    ])('locks with %s', async (_label, stored) => {
      await launch(stored);
      expect(lock().locked).toBe(true);
    });

    it('locks when the settings record cannot be read', async () => {
      await launch({ appLock: true, appLockAwaySince: iso(T0 - MIN) }, { loadThrows: true });
      expect(useSettingsStore.getState().loadFailed).toBe(true);
      expect(lock().locked).toBe(true);
    });

    // Never seen in this app, but a launch into the background must not
    // restart the clock: the trip still began when the app last went away.
    it('a launch that opened, then went to the background before coming to the front, keeps the trip’s start', async () => {
      await launch({ appLock: true, appLockAwaySince: iso(T0 - 4 * MIN) });
      expect(lock().locked).toBe(false);
      lock().appPhaseChanged('background');
      advance(2 * MIN);
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(true);
    });

    it('never locks with the lock off, whatever is kept', async () => {
      await launch({ appLock: false, appLockGraceMinutes: 0, appLockAwaySince: iso(T0 - 60 * MIN) });
      expect(lock().locked).toBe(false);
    });
  });

  describe('with the lock off', () => {
    it.each<LockGraceMinutes>([0, 1, 5, 15])('never locks or covers with %i minutes, and keeps no time away', async (grace) => {
      const rec = record();
      useSettingsStore.setState({ appLock: false, appLockGraceMinutes: grace });
      lock().arm();
      lock().appPhaseChanged('inactive');
      lock().appPhaseChanged('background');
      expect(lock().locked).toBe(false);
      expect(lock().covered).toBe(false);
      advance(60 * MIN);
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(false);
      await flush();
      expect(rec.saved).toHaveLength(0);
    });

    it('on a build without the module, never locks with any grace', () => {
      record();
      __setLockDepsForTests(null);
      withGrace(5);
      lock().appPhaseChanged('background');
      advance(60 * MIN);
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(false);
      expect(lock().covered).toBe(false);
    });
  });

  describe('the switch and the setting', () => {
    it('turning the lock off and on again forgets an old time away, so it cannot open a launch', async () => {
      const rec = record();
      useSettingsStore.setState({ appLock: true, appLockAwaySince: iso(T0 - MIN) });
      expect(await lock().setEnabled(false)).toBe('changed');
      expect(rec.saved.at(-1)).toMatchObject({ appLock: false, appLockAwaySince: null });
      expect(await lock().setEnabled(true)).toBe('changed');
      expect(rec.saved.at(-1)).toMatchObject({ appLock: true, appLockAwaySince: null });
      // Turning it on leaves the app open, as before.
      expect(lock().locked).toBe(false);

      __resetLockStoreForTests();
      await launch(rec.stored());
      expect(lock().locked).toBe(true);
    });

    it('a trip under way when the lock is turned off is dropped', async () => {
      record();
      on();
      const finishers = heldPrompts();
      const change = lock().setEnabled(false);
      await settle();
      // "Turn off the app lock" is up when the app goes away.
      lock().appPhaseChanged('background');
      expect(lock().covered).toBe(true);
      finishers[0]({ success: true });
      expect(await change).toBe('changed');
      expect(lock().covered).toBe(false);
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(false);
      expect(useSettingsStore.getState().appLockAwaySince).toBeNull();
    });

    it('changing Lock after neither locks nor opens the app now, and asks nothing', async () => {
      const rec = record();
      on();
      await useSettingsStore.getState().setAppLockGraceMinutes(0);
      expect(lock().locked).toBe(false);
      expect(rec.saved.at(-1)?.appLockGraceMinutes).toBe(0);

      lock().arm();
      expect(lock().locked).toBe(true);
      await useSettingsStore.getState().setAppLockGraceMinutes(15);
      expect(lock().locked).toBe(true);
      expect(authenticateAsync).not.toHaveBeenCalled();
    });

    it('a new Lock after applies to the next trip away', () => {
      record();
      on();
      lock().appPhaseChanged('background');
      advance(2 * MIN);
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(false);

      useSettingsStore.setState({ appLockGraceMinutes: 1 });
      lock().appPhaseChanged('background');
      advance(2 * MIN);
      lock().appPhaseChanged('active');
      expect(lock().locked).toBe(true);
    });
  });
});
