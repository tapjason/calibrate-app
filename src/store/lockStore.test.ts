// When the app locks and what opens it (roadmap D64, step 180).

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
  it('stays open when the person never chose a lock', () => {
    lock().arm();
    expect(lock().locked).toBe(false);
    lock().appPhaseChanged('active');
    expect(authenticateAsync).not.toHaveBeenCalled();
  });

  it('locks, then asks once when the app is active, and opens on a pass', async () => {
    on();
    lock().arm();
    expect(lock().locked).toBe(true);
    expect(authenticateAsync).not.toHaveBeenCalled();
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    expect(authenticateAsync.mock.calls[0][0].promptMessage).toBe(UNLOCK_REASON);
    expect(lock().locked).toBe(false);
    expect(lock().method).toBe('Face ID');
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

  it('locks on the background and asks once on return', async () => {
    on();
    lock().appPhaseChanged('inactive');
    lock().appPhaseChanged('background');
    expect(lock().locked).toBe(true);
    lock().appPhaseChanged('inactive');
    expect(authenticateAsync).not.toHaveBeenCalled();
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    expect(lock().locked).toBe(false);
  });

  // iOS's own prompt can send the app through inactive and back: a prompt
  // that reopened itself on every cancel would be a loop.
  it('does not ask again by itself after a prompt that was closed', async () => {
    on();
    answers = [{ success: false, error: 'user_cancel' }];
    lock().arm();
    lock().appPhaseChanged('active');
    await settle();
    expect(lock().locked).toBe(true);
    expect(lock().notice).toBeNull();
    lock().appPhaseChanged('inactive');
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    // Unlock asks again; so does leaving and coming back.
    await lock().unlock();
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
    expect(lock().locked).toBe(false);
  });

  it('asks again after the app has been away', async () => {
    on();
    answers = [{ success: false, error: 'system_cancel' }];
    lock().arm();
    lock().appPhaseChanged('active');
    await settle();
    lock().appPhaseChanged('background');
    lock().appPhaseChanged('active');
    await settle();
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
    expect(lock().locked).toBe(false);
  });

  it('says a check failed, and stays locked', async () => {
    on();
    answers = [{ success: false, error: 'not_available' }];
    lock().arm();
    lock().appPhaseChanged('active');
    await settle();
    expect(lock().locked).toBe(true);
    expect(lock().notice).toBe('failed');
  });

  it('shows one prompt at a time', async () => {
    on();
    let finish: (r: Result) => void = () => {};
    authenticateAsync = jest.fn(
      (_options: { promptMessage: string }) => new Promise<Result>((resolve) => (finish = resolve)),
    );
    install();
    lock().arm();
    lock().appPhaseChanged('active');
    void lock().unlock();
    void lock().unlock();
    expect(lock().checking).toBe(true);
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    finish({ success: true });
    await settle();
    expect(lock().checking).toBe(false);
    expect(lock().locked).toBe(false);
  });
});

// Removing a passcode takes the passcode, so this is the one failure that
// opens the app; the person is told, and the lock is turned off.
describe('lockStore: a phone that lost its passcode', () => {
  it('says so, and Continue turns the lock off and opens', async () => {
    on();
    answers = [{ success: false, error: 'passcode_not_set' }];
    lock().arm();
    lock().appPhaseChanged('active');
    await settle();
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
    await settle();
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
    const finishers: Array<(r: Result) => void> = [];
    authenticateAsync = jest.fn(
      (_options: { promptMessage: string }) =>
        new Promise<Result>((resolve) => {
          finishers.push(resolve);
        }),
    );
    install();
    lock().arm();
    lock().appPhaseChanged('active');
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
    const finishers: Array<(r: Result) => void> = [];
    authenticateAsync = jest.fn(
      (_options: { promptMessage: string }) =>
        new Promise<Result>((resolve) => {
          finishers.push(resolve);
        }),
    );
    install();
    lock().arm();
    lock().appPhaseChanged('active');
    await settle();
    lock().appPhaseChanged('background');
    lock().appPhaseChanged('active');
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
    await settle();
    expect(lock().notice).toBe('failed');
    let finish: (r: Result) => void = () => {};
    authenticateAsync = jest.fn(
      (_options: { promptMessage: string }) =>
        new Promise<Result>((resolve) => {
          finish = resolve;
        }),
    );
    install();
    const again = lock().unlock();
    expect(lock().notice).toBeNull();
    finish({ success: false, error: 'not_available' });
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

  // A prompt that never answers at all: leaving and coming back still asks.
  it('asks again on return even if the last prompt never answered', async () => {
    on();
    authenticateAsync = jest.fn(
      (_options: { promptMessage: string }) => new Promise<Result>(() => {}),
    );
    install();
    lock().arm();
    lock().appPhaseChanged('active');
    await settle();
    lock().appPhaseChanged('background');
    lock().appPhaseChanged('active');
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
    let finish: (r: Result) => void = () => {};
    authenticateAsync = jest.fn(
      (_options: { promptMessage: string }) =>
        new Promise<Result>((resolve) => {
          finish = resolve;
        }),
    );
    install();
    const change = lock().setEnabled(false);
    await settle();
    useLockStore.setState({ locked: true, promptOwed: true, covered: true });
    finish({ success: true });
    expect(await change).toBe('changed');
    expect(useSettingsStore.getState().appLock).toBe(false);
    expect(lock().locked).toBe(false);
    expect(lock().covered).toBe(false);
    expect(lock().promptOwed).toBe(false);
  });
});
