// The phone's notification permission in settingsStore (security review,
// 2026-11-18, round 4): read at launch, on every return to the foreground and
// after the app asks; unknown (null) whenever it can't be read.

import { AppState } from 'react-native';

import {
  __setPersistenceForTests,
  useSettingsStore,
  type StoredSettings,
} from '@/store/settingsStore';

import {
  __resetPermissionStateForTests,
  permissionFrom,
  refreshNotificationPermission,
  trackNotificationPermission,
  type PermissionReadApi,
} from './permissionState';

/** A phone whose answer the test can change, counting the reads. */
function fakePhone(initial: { granted: boolean; status?: string }) {
  let answer = initial;
  const getPermissionsAsync = jest.fn(async () => answer);
  const api: PermissionReadApi = { getPermissionsAsync };
  return {
    api,
    getPermissionsAsync,
    set(next: { granted: boolean; status?: string }) {
      answer = next;
    },
  };
}

const GRANTED = { granted: true, status: 'granted' };
const DENIED = { granted: false, status: 'denied' };
const UNDETERMINED = { granted: false, status: 'undetermined' };

const permission = () => useSettingsStore.getState().notificationPermission;

/** Lets pending reads settle. */
const settle = () => new Promise((r) => setImmediate(r));

let appStateListener: ((state: string) => void) | undefined;
let removeListener: jest.Mock;

beforeEach(() => {
  useSettingsStore.setState({ notificationPermission: null });
  appStateListener = undefined;
  removeListener = jest.fn();
  // jest-expo's AppState.addEventListener is already a mock, so the spy is
  // the same function in every test: cleared here, so counts are per test.
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove: removeListener } as unknown as ReturnType<typeof AppState.addEventListener>;
    })
    .mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  __resetPermissionStateForTests();
  jest.restoreAllMocks();
  // Default persistence back, and the store reset (the permission with it).
  __setPersistenceForTests(null);
});

describe('permissionFrom', () => {
  it("is 'granted' exactly when the system says granted, as the schedulers check", () => {
    expect(permissionFrom(GRANTED)).toBe('granted');
    expect(permissionFrom({ granted: true })).toBe('granted');
  });

  it("is 'undetermined' while the app can still ask, and 'denied' otherwise", () => {
    expect(permissionFrom(UNDETERMINED)).toBe('undetermined');
    expect(permissionFrom(DENIED)).toBe('denied');
    expect(permissionFrom({ granted: false })).toBe('denied');
    expect(permissionFrom({ granted: 'yes', status: 'granted' })).toBe('denied');
  });

  it('refuses an answer that is not one', () => {
    expect(() => permissionFrom(null)).toThrow();
    expect(() => permissionFrom(undefined)).toThrow();
  });
});

describe('refreshNotificationPermission', () => {
  it.each([
    ['granted', GRANTED],
    ['denied', DENIED],
    ['undetermined', UNDETERMINED],
  ] as const)('puts %s in the store', async (expected, answer) => {
    __resetPermissionStateForTests(fakePhone(answer).api);
    await refreshNotificationPermission();
    expect(permission()).toBe(expected);
  });

  it('never asks', async () => {
    const phone = fakePhone(UNDETERMINED);
    const requestPermissionsAsync = jest.fn();
    __resetPermissionStateForTests({ ...phone.api, requestPermissionsAsync } as PermissionReadApi);
    await refreshNotificationPermission();
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(phone.getPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  // Service down: nothing is promised, and nothing throws.
  it('leaves it unknown where there are no notifications (web)', async () => {
    useSettingsStore.setState({ notificationPermission: 'granted' });
    __resetPermissionStateForTests(null);
    await expect(refreshNotificationPermission()).resolves.toBeUndefined();
    expect(permission()).toBeNull();
  });

  it('makes it unknown when the read fails, never throwing', async () => {
    useSettingsStore.setState({ notificationPermission: 'granted' });
    __resetPermissionStateForTests({
      getPermissionsAsync: async () => {
        throw new Error('module missing');
      },
    });
    await expect(refreshNotificationPermission()).resolves.toBeUndefined();
    expect(permission()).toBeNull();
  });

  it('makes it unknown when the answer cannot be read', async () => {
    useSettingsStore.setState({ notificationPermission: 'granted' });
    __resetPermissionStateForTests({
      getPermissionsAsync: async () => undefined as unknown as { granted: boolean },
    });
    await refreshNotificationPermission();
    expect(permission()).toBeNull();
  });

  it('keeps the newer answer when an older read lands last', async () => {
    let finishFirst: (answer: { granted: boolean; status?: string }) => void = () => {};
    const reads = [
      new Promise<{ granted: boolean; status?: string }>((r) => (finishFirst = r)),
      Promise.resolve(DENIED),
    ];
    __resetPermissionStateForTests({ getPermissionsAsync: () => reads.shift()! });

    const first = refreshNotificationPermission();
    await refreshNotificationPermission();
    expect(permission()).toBe('denied');

    finishFirst(GRANTED);
    await first;
    expect(permission()).toBe('denied');
  });

  it('is never written to the stored settings', async () => {
    const save = jest.fn(async (_settings: StoredSettings) => {});
    __setPersistenceForTests({ load: async () => null, save });
    __resetPermissionStateForTests(fakePhone(GRANTED).api);

    await refreshNotificationPermission();
    expect(permission()).toBe('granted');
    expect(save).not.toHaveBeenCalled();

    // A setting changed later stores its snapshot, without the permission.
    await useSettingsStore.getState().setStreakShown(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).not.toHaveProperty('notificationPermission');
  });
});

describe('trackNotificationPermission', () => {
  it('reads at once, at launch', async () => {
    const phone = fakePhone(GRANTED);
    __resetPermissionStateForTests(phone.api);

    trackNotificationPermission();
    await settle();
    expect(permission()).toBe('granted');
    expect(phone.getPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  // Permission is changed in iOS Settings, outside the app: the return to the
  // foreground is where it shows up.
  it('reads again on each return to the foreground, and follows a change made in iOS Settings', async () => {
    const phone = fakePhone(GRANTED);
    __resetPermissionStateForTests(phone.api);
    trackNotificationPermission();
    await settle();
    expect(permission()).toBe('granted');

    phone.set(DENIED);
    appStateListener?.('background');
    await settle();
    expect(permission()).toBe('granted');
    expect(phone.getPermissionsAsync).toHaveBeenCalledTimes(1);

    appStateListener?.('active');
    await settle();
    expect(permission()).toBe('denied');

    phone.set(GRANTED);
    appStateListener?.('active');
    await settle();
    expect(permission()).toBe('granted');
    expect(phone.getPermissionsAsync).toHaveBeenCalledTimes(3);
  });

  it('starts once, however often it is called', async () => {
    __resetPermissionStateForTests(fakePhone(GRANTED).api);
    trackNotificationPermission();
    trackNotificationPermission();
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
  });
});
