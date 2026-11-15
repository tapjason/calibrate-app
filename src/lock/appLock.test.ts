// The app lock's service (roadmap D64, step 180): what the phone can do, what
// to call it, and how one check ends. The native module is a fake here; what
// only an iPhone can show is in docs/HUMAN_VERIFICATION.md.

import {
  __setLockDepsForTests,
  abandonCheck,
  checkLock,
  lockMethod,
  lockSupport,
  lockSupported,
  passcodeSettingsPage,
  type LockDeps,
} from './appLock';

function fake(over: Partial<LockDeps> = {}): LockDeps {
  return {
    getEnrolledLevelAsync: async () => 3,
    supportedAuthenticationTypesAsync: async () => [2],
    authenticateAsync: async () => ({ success: true }),
    ...over,
  };
}

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
afterEach(() => {
  __setLockDepsForTests(undefined);
  jest.restoreAllMocks();
});

describe('lockSupport', () => {
  it('is ready with Face ID or with a passcode alone, and not with neither', async () => {
    __setLockDepsForTests(fake({ getEnrolledLevelAsync: async () => 3 }));
    expect(await lockSupport()).toBe('ready');
    __setLockDepsForTests(fake({ getEnrolledLevelAsync: async () => 1 }));
    expect(await lockSupport()).toBe('ready');
    __setLockDepsForTests(fake({ getEnrolledLevelAsync: async () => 0 }));
    expect(await lockSupport()).toBe('no_passcode');
  });

  it('is unsupported on a build without the module, and when the phone cannot say', async () => {
    __setLockDepsForTests(null);
    expect(lockSupported()).toBe(false);
    expect(await lockSupport()).toBe('unsupported');
    __setLockDepsForTests(
      fake({
        getEnrolledLevelAsync: async () => {
          throw new Error('no');
        },
      }),
    );
    expect(lockSupported()).toBe(true);
    expect(await lockSupport()).toBe('unsupported');
    // jest-expo's own mock answers undefined: not a level.
    __setLockDepsForTests(fake({ getEnrolledLevelAsync: async () => undefined as unknown as number }));
    expect(await lockSupport()).toBe('no_passcode');
  });
});

// HIG: name only a method this phone has.
describe('lockMethod', () => {
  it('names Face ID, Touch ID, or the passcode', async () => {
    __setLockDepsForTests(fake({ supportedAuthenticationTypesAsync: async () => [2] }));
    expect(await lockMethod()).toBe('Face ID');
    __setLockDepsForTests(fake({ supportedAuthenticationTypesAsync: async () => [1] }));
    expect(await lockMethod()).toBe('Touch ID');
    __setLockDepsForTests(fake({ supportedAuthenticationTypesAsync: async () => [] }));
    expect(await lockMethod()).toBe('your passcode');
    __setLockDepsForTests(null);
    expect(await lockMethod()).toBe('your passcode');
  });

  // Face ID not set up, or switched off for the app: iOS then asks only for
  // the passcode, so the words say the passcode (policy audit of step 180).
  it('names the passcode on a Face ID phone that is not using Face ID', async () => {
    __setLockDepsForTests(
      fake({ supportedAuthenticationTypesAsync: async () => [2], getEnrolledLevelAsync: async () => 1 }),
    );
    expect(await lockMethod()).toBe('your passcode');
    __setLockDepsForTests(
      fake({ supportedAuthenticationTypesAsync: async () => [1], getEnrolledLevelAsync: async () => 0 }),
    );
    expect(await lockMethod()).toBe('your passcode');
  });
});

describe('checkLock', () => {
  it('asks with the passcode as the way in, and the reason given', async () => {
    const authenticateAsync = jest.fn(async () => ({ success: true }));
    __setLockDepsForTests(fake({ authenticateAsync }));
    expect(await checkLock('Unlock Fairly Sure')).toBe('passed');
    expect(authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Unlock Fairly Sure',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
  });

  it.each(['user_cancel', 'system_cancel', 'app_cancel'])('reads %s as a closed prompt', async (error) => {
    __setLockDepsForTests(fake({ authenticateAsync: async () => ({ success: false, error }) }));
    expect(await checkLock('x')).toBe('cancelled');
  });

  it('says so when the phone has no passcode', async () => {
    __setLockDepsForTests(
      fake({ authenticateAsync: async () => ({ success: false, error: 'passcode_not_set' }) }),
    );
    expect(await checkLock('x')).toBe('no_passcode');
  });

  // Face ID can be turned off for one app in Settings without the passcode:
  // that must never read as "nothing to check against".
  it.each(['not_available', 'not_enrolled', 'lockout', 'authentication_failed', 'unknown: -1, x'])(
    'keeps the lock on %s',
    async (error) => {
      __setLockDepsForTests(fake({ authenticateAsync: async () => ({ success: false, error }) }));
      expect(await checkLock('x')).toBe('failed');
    },
  );

  it('fails closed when the call throws, and when the module is missing', async () => {
    __setLockDepsForTests(
      fake({
        authenticateAsync: async () => {
          throw new Error('boom');
        },
      }),
    );
    expect(await checkLock('x')).toBe('failed');
    __setLockDepsForTests(null);
    expect(await checkLock('x')).toBe('failed');
  });

  it('shows one prompt at a time: a second call gets the first answer', async () => {
    let finish: (v: { success: boolean }) => void = () => {};
    const authenticateAsync = jest.fn(
      () => new Promise<{ success: boolean }>((resolve) => (finish = resolve)),
    );
    __setLockDepsForTests(fake({ authenticateAsync }));
    const first = checkLock('one');
    const second = checkLock('two');
    finish({ success: true });
    expect(await first).toBe('passed');
    expect(await second).toBe('passed');
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    // And the next call asks again.
    void checkLock('three');
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
    finish({ success: true });
  });
});

// Code review of step 180: a prompt that never answers must not hold the next one.
describe('abandonCheck', () => {
  it('lets the next call ask again, and the old answer cannot free the new prompt’s place', async () => {
    const finishers: Array<(v: { success: boolean; error?: string }) => void> = [];
    const authenticateAsync = jest.fn(
      () =>
        new Promise<{ success: boolean; error?: string }>((resolve) => {
          finishers.push(resolve);
        }),
    );
    __setLockDepsForTests(fake({ authenticateAsync }));
    const first = checkLock('one');
    abandonCheck();
    const second = checkLock('two');
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
    // The abandoned prompt answers late: the second is still the one in flight.
    finishers[0]({ success: false, error: 'system_cancel' });
    expect(await first).toBe('cancelled');
    const joined = checkLock('three');
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
    finishers[1]({ success: true });
    expect(await second).toBe('passed');
    expect(await joined).toBe('passed');
  });
});

describe('passcodeSettingsPage', () => {
  it('follows the hardware, whatever is in use', async () => {
    __setLockDepsForTests(
      fake({ supportedAuthenticationTypesAsync: async () => [1], getEnrolledLevelAsync: async () => 0 }),
    );
    expect(await passcodeSettingsPage()).toBe('Touch ID & Passcode');
    __setLockDepsForTests(fake({ supportedAuthenticationTypesAsync: async () => [2] }));
    expect(await passcodeSettingsPage()).toBe('Face ID & Passcode');
    __setLockDepsForTests(fake({ supportedAuthenticationTypesAsync: async () => [] }));
    expect(await passcodeSettingsPage()).toBe('Face ID & Passcode');
    __setLockDepsForTests(null);
    expect(await passcodeSettingsPage()).toBe('Face ID & Passcode');
  });
});
