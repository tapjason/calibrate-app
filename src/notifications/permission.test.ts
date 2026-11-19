// askForReminders reads the answer back into settingsStore, so the paywall's
// trial timeline follows it at once (security review, 2026-11-18, round 4).

jest.mock('./scheduler', () => ({
  requestReminderPermission: jest.fn(),
  reminderPermission: jest.fn(),
  reminderTimeFor: jest.fn(),
}));
jest.mock('./digest', () => ({ activateDigest: jest.fn(async () => {}) }));

import { useSettingsStore } from '@/store/settingsStore';

import * as digest from './digest';
import { askForReminders } from './permission';
import { __resetPermissionStateForTests } from './permissionState';
import * as scheduler from './scheduler';

const request = (scheduler as jest.Mocked<typeof scheduler>).requestReminderPermission;
const activateDigest = (digest as jest.Mocked<typeof digest>).activateDigest;

/** The phone, answering the system alert the way `answer` says. */
function phoneAnswering(answer: { granted: boolean; status: string }) {
  __resetPermissionStateForTests({ getPermissionsAsync: async () => answer });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ notificationPermission: 'undetermined' });
});

afterEach(() => {
  __resetPermissionStateForTests();
  useSettingsStore.setState({ notificationPermission: null });
});

describe('askForReminders', () => {
  it("puts 'granted' in the store once the person allows, and starts the digest", async () => {
    phoneAnswering({ granted: true, status: 'granted' });
    request.mockResolvedValue('granted');

    await expect(askForReminders()).resolves.toBe('granted');
    expect(useSettingsStore.getState().notificationPermission).toBe('granted');
    expect(activateDigest).toHaveBeenCalledTimes(1);
  });

  it("puts 'denied' in the store when the person declines", async () => {
    phoneAnswering({ granted: false, status: 'denied' });
    request.mockResolvedValue('denied');

    await expect(askForReminders()).resolves.toBe('denied');
    expect(useSettingsStore.getState().notificationPermission).toBe('denied');
    expect(activateDigest).not.toHaveBeenCalled();
  });

  // Service down: the ask still answers, and nothing is promised.
  it('leaves the permission unknown when it cannot be read back', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    __resetPermissionStateForTests({
      getPermissionsAsync: async () => {
        throw new Error('module missing');
      },
    });
    request.mockResolvedValue('granted');

    await expect(askForReminders()).resolves.toBe('granted');
    expect(useSettingsStore.getState().notificationPermission).toBeNull();
    jest.restoreAllMocks();
  });
});
