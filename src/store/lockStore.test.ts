// When the app locks and what opens it (roadmap D64, step 180). Since D74
// (the owner, 2026-11-21) only a tap on Unlock asks the phone: nothing asks
// by itself at launch or on a return from the background.

import { __setLockDepsForTests, type LockDeps } from '@/lock/appLock';

import {
  __resetLockStoreForTests,
  LOCK_OFF_REASON,
  LOCK_ON_REASON,
  UNLOCK_REASON,
  useLockStore,
} from './lockStore';
import { __setPersistenceForTests, useSettingsStore } from './settingsStore';

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
const on = () => useSettingsStore.setState({ appLock: true });

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

  // D74: switching back opens on the lock screen, not on Face ID.
  it('locks on the background, and on return uncovers and waits for Unlock', async () => {
    on();
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
