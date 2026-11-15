import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { __setLockDepsForTests, type LockDeps } from '@/lock/appLock';
import { useEntitlementStore } from '@/store/entitlementStore';
import { __resetLockStoreForTests } from '@/store/lockStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { FREE_ENTITLEMENT } from '@/types';

import {
  APP_LOCK_FAILED,
  appLockLabel,
  appLockLine,
  reminderWordsLine,
  SettingsView,
} from './SettingsView';

jest.mock('@/notifications/permission', () => ({
  reminderPermission: jest.fn(async () => 'granted'),
  askForReminders: jest.fn(async () => 'granted'),
}));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));

type Result = { success: boolean; error?: string };
let answers: Result[];
let level: number;
let types: number[];

function install(present = true): void {
  const deps: LockDeps = {
    getEnrolledLevelAsync: async () => level,
    supportedAuthenticationTypesAsync: async () => types,
    authenticateAsync: async () => answers.shift() ?? { success: true },
  };
  __setLockDepsForTests(present ? deps : null);
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  answers = [];
  level = 3;
  types = [2];
  install();
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  __resetLockStoreForTests();
  useEntitlementStore.setState({ entitlement: FREE_ENTITLEMENT, isPlus: false, hydrated: true });
});

afterEach(() => {
  __setLockDepsForTests(undefined);
  __setPersistenceForTests(null);
  jest.restoreAllMocks();
});

// Roadmap D64 (step 180): the lock's switch in You.
describe('SettingsView: the app lock', () => {
  it('is off to start, named for how this phone unlocks', async () => {
    render(<SettingsView />);
    const row = await screen.findByTestId('toggle-app-lock-row');
    expect(row.props.accessibilityLabel).toBe('Lock with Face ID');
    expect(row.props.accessibilityState.checked).toBe(false);
    expect(row.props.accessibilityHint).toMatch(/Asks for Face ID, or your iPhone passcode, each time/);
  });

  it('turns on once the phone has checked, and off the same way', async () => {
    render(<SettingsView />);
    const row = await screen.findByTestId('toggle-app-lock-row');
    await act(async () => {
      fireEvent.press(row);
    });
    await waitFor(() => expect(useSettingsStore.getState().appLock).toBe(true));
    expect(screen.getByTestId('toggle-app-lock-row').props.accessibilityState.checked).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByTestId('toggle-app-lock-row'));
    });
    await waitFor(() => expect(useSettingsStore.getState().appLock).toBe(false));
  });

  it('stays as it was, without a word, when the prompt is closed', async () => {
    answers = [{ success: false, error: 'user_cancel' }];
    render(<SettingsView />);
    const row = await screen.findByTestId('toggle-app-lock-row');
    await act(async () => {
      fireEvent.press(row);
    });
    expect(useSettingsStore.getState().appLock).toBe(false);
    expect(screen.getByTestId('toggle-app-lock-row').props.accessibilityHint).not.toMatch(
      /didn’t go through/,
    );
  });

  it('says nothing changed when the check fails', async () => {
    answers = [{ success: false, error: 'lockout' }];
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    render(<SettingsView />);
    const row = await screen.findByTestId('toggle-app-lock-row');
    await act(async () => {
      fireEvent.press(row);
    });
    expect(useSettingsStore.getState().appLock).toBe(false);
    await waitFor(() =>
      expect(screen.getByTestId('toggle-app-lock-row').props.accessibilityHint).toMatch(
        /That didn’t go through, so nothing changed\./,
      ),
    );
    // Said aloud too: a changed hint isn't read out by itself.
    expect(announce).toHaveBeenCalledWith(APP_LOCK_FAILED);
  });

  it('says to set a passcode first on a phone without one', async () => {
    level = 0;
    types = [];
    render(<SettingsView />);
    const row = await screen.findByTestId('toggle-app-lock-row');
    expect(row.props.accessibilityLabel).toBe('Lock with iPhone passcode');
    expect(row.props.accessibilityHint).toMatch(/This iPhone has no passcode/);
    await act(async () => {
      fireEvent.press(row);
    });
    expect(useSettingsStore.getState().appLock).toBe(false);
  });

  // The page's name follows the hardware, not what is in use: with no
  // passcode nothing is in use, and a Touch ID iPhone still has no Face ID page.
  it('points a Touch ID iPhone with no passcode at Touch ID & Passcode', async () => {
    level = 0;
    types = [1];
    render(<SettingsView />);
    const row = await screen.findByTestId('toggle-app-lock-row');
    await waitFor(() =>
      expect(screen.getByTestId('toggle-app-lock-row').props.accessibilityHint).toMatch(
        /Settings → Touch ID & Passcode/,
      ),
    );
    expect(row.props.accessibilityLabel).toBe('Lock with iPhone passcode');
  });

  it('is not offered on a build that cannot lock', async () => {
    install(false);
    render(<SettingsView />);
    await waitFor(() => expect(screen.getByTestId('toggle-hide-titles-row')).toBeTruthy());
    expect(screen.queryByTestId('toggle-app-lock-row')).toBeNull();
  });
});

describe('the lock switch in words', () => {
  it('never names Face ID on a phone without it', () => {
    expect(appLockLabel('Touch ID')).toBe('Lock with Touch ID');
    expect(appLockLabel('your passcode')).toBe('Lock with iPhone passcode');
    expect(appLockLine('ready', 'your passcode', false)).toMatch(/^Asks for your iPhone passcode each time/);
    expect(appLockLine('ready', 'your passcode', false)).not.toMatch(/Face ID|Touch ID/);
    expect(appLockLine('ready', 'Touch ID', false)).toMatch(/Touch ID, or your iPhone passcode,/);
  });

  // Policy audit of step 180: the line mustn't promise more than the lock does.
  it('says reminders are not covered, and what changes on them', () => {
    const line = appLockLine('ready', 'Face ID', false);
    expect(line).toMatch(/Reminders aren’t covered/);
    expect(line).toMatch(/no Happened or Didn’t/);
    expect(line).toMatch(/their own switch under Notifications/);
  });

  it('names the Settings page it is given when there is no passcode', () => {
    expect(appLockLine('no_passcode', 'your passcode', false, 'Touch ID & Passcode')).toMatch(
      /Settings → Touch ID & Passcode/,
    );
    expect(appLockLine('no_passcode', 'your passcode', false)).toMatch(/Face ID & Passcode/);
  });

  // With the lock on a reminder can't answer for you, so its line stops saying it can.
  it('stops promising Happened and Didn’t on reminders while the lock is on', () => {
    expect(reminderWordsLine(true)).toMatch(/Happened and Didn't to answer from it/);
    expect(reminderWordsLine(true, true)).not.toMatch(/Happened/);
    expect(reminderWordsLine(true, true)).toMatch(/opens the question behind the app lock/);
    expect(reminderWordsLine(false, true)).toBe(reminderWordsLine(false, false));
  });
});
