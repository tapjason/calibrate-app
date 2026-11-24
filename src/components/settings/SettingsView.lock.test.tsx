import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { __setLockDepsForTests, type LockDeps } from '@/lock/appLock';
import { useEntitlementStore } from '@/store/entitlementStore';
import { __resetLockStoreForTests, useLockStore } from '@/store/lockStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { FREE_ENTITLEMENT, LOCK_GRACE_MINUTES, type LockGraceMinutes } from '@/types';

import {
  APP_LOCK_FAILED,
  appLockLabel,
  appLockLine,
  lockAfterLabel,
  lockAfterLine,
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
/** How many times the phone was asked to check. */
let asked: number;

function install(present = true): void {
  const deps: LockDeps = {
    getEnrolledLevelAsync: async () => level,
    supportedAuthenticationTypesAsync: async () => types,
    authenticateAsync: async () => {
      asked += 1;
      return answers.shift() ?? { success: true };
    },
  };
  __setLockDepsForTests(present ? deps : null);
}

/** The no-break space that holds a count to its unit. */
const NB = ' ';
/** A string as it reads, the no-break spaces as plain ones. */
const plain = (s: string) => s.split(NB).join(' ');

// The store's own setter, put back after a test wraps it.
const realSetGrace = useSettingsStore.getState().setAppLockGraceMinutes;

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  answers = [];
  level = 3;
  types = [2];
  asked = 0;
  install();
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  __resetLockStoreForTests();
  useEntitlementStore.setState({ entitlement: FREE_ENTITLEMENT, isPlus: false, hydrated: true });
});

afterEach(() => {
  useSettingsStore.setState({ setAppLockGraceMinutes: realSetGrace });
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
    // "Lock after" starts at 5 minutes (D75), and the first sentence says so.
    expect(plain(row.props.accessibilityHint)).toMatch(
      /^Locks Fairly Sure once you’ve been away from it for more than 5 minutes, and covers it in the app switcher\. /,
    );
    expect(row.props.accessibilityHint).toMatch(/Unlock opens it with Face ID or your iPhone passcode\./);
  });

  it('says it locks each time it opens or comes back with Lock after at Immediately', async () => {
    useSettingsStore.setState({ appLockGraceMinutes: 0 });
    render(<SettingsView />);
    const row = await screen.findByTestId('toggle-app-lock-row');
    expect(row.props.accessibilityHint).toMatch(
      /^Locks Fairly Sure each time it opens or comes back to the front, and covers it in the app switcher\. /,
    );
    expect(row.props.accessibilityHint).toMatch(/Unlock opens it with Face ID or your iPhone passcode\./);
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

// Roadmap D75 (the owner, 2026-11-23): "Lock after", under the switch.
describe('SettingsView: Lock after', () => {
  const chosen = (minutes: LockGraceMinutes) =>
    screen.getByTestId(`lock-after-${minutes}`).props.accessibilityState?.selected;
  const enabled = async (minutes: LockGraceMinutes) =>
    waitFor(() =>
      expect(screen.getByTestId(`lock-after-${minutes}`).props.accessibilityState?.disabled).toBe(false),
    );

  it('is not shown while the lock is off', async () => {
    render(<SettingsView />);
    await screen.findByTestId('toggle-app-lock-row');
    expect(screen.queryByTestId('settings-lock-after')).toBeNull();
    expect(screen.queryByText('Lock after')).toBeNull();
  });

  it('appears under the switch once the lock is turned on, and goes when it is turned off', async () => {
    render(<SettingsView />);
    const row = await screen.findByTestId('toggle-app-lock-row');
    await act(async () => {
      fireEvent.press(row);
    });
    expect(await screen.findByTestId('settings-lock-after')).toBeTruthy();
    expect(screen.getByText('Lock after')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('toggle-app-lock-row'));
    });
    await waitFor(() => expect(screen.queryByTestId('settings-lock-after')).toBeNull());
  });

  it('is not shown on a build that cannot lock, even with the lock on', async () => {
    install(false);
    useSettingsStore.setState({ appLock: true });
    render(<SettingsView />);
    await waitFor(() => expect(screen.getByTestId('toggle-hide-titles-row')).toBeTruthy());
    expect(screen.queryByTestId('settings-lock-after')).toBeNull();
  });

  it('is not shown while the phone has no passcode, even with the lock on', async () => {
    level = 0;
    types = [];
    useSettingsStore.setState({ appLock: true });
    render(<SettingsView />);
    await waitFor(() =>
      expect(screen.getByTestId('toggle-app-lock-row').props.accessibilityHint).toMatch(
        /This iPhone has no passcode/,
      ),
    );
    expect(screen.queryByTestId('settings-lock-after')).toBeNull();
  });

  it('offers four choices in order in a named radio group, 5 minutes chosen to start', async () => {
    useSettingsStore.setState({ appLock: true });
    render(<SettingsView />);
    const group = await screen.findByTestId('settings-lock-after');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(group.props.accessibilityLabel).toBe('Lock after');
    const options = within(group).getAllByRole('radio');
    expect(options.map((o) => plain(o.props.accessibilityLabel))).toEqual([
      'Immediately',
      '1 minute',
      '5 minutes',
      '15 minutes',
    ]);
    expect(options.map((o) => o.props.testID)).toEqual(
      LOCK_GRACE_MINUTES.map((m) => `lock-after-${m}`),
    );
    expect(chosen(5)).toBe(true);
    expect(chosen(0)).toBe(false);
    expect(chosen(1)).toBe(false);
    expect(chosen(15)).toBe(false);
    expect(plain(screen.getByTestId('settings-lock-after-line').props.children)).toBe(
      'Come back within 5 minutes and it opens without asking.',
    );
  });

  it('saves Immediately when it is pressed, asks the phone nothing, and the lines follow', async () => {
    const setGrace = jest.fn(realSetGrace);
    useSettingsStore.setState({ appLock: true, setAppLockGraceMinutes: setGrace });
    render(<SettingsView />);
    await screen.findByTestId('settings-lock-after');
    await enabled(0);
    await act(async () => {
      fireEvent.press(screen.getByTestId('lock-after-0'));
    });
    await waitFor(() => expect(setGrace).toHaveBeenCalledWith(0));
    expect(setGrace).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().appLockGraceMinutes).toBe(0);
    await waitFor(() => expect(chosen(0)).toBe(true));
    expect(chosen(5)).toBe(false);
    expect(screen.getByTestId('settings-lock-after-line').props.children).toBe(
      'It locks every time you leave it.',
    );
    // The switch's own line says when it locks now.
    expect(screen.getByTestId('toggle-app-lock-row').props.accessibilityHint).toMatch(
      /^Locks Fairly Sure each time it opens or comes back to the front/,
    );
    // Changing the choice needs no check (decided), and locks nothing now.
    expect(asked).toBe(0);
    expect(useLockStore.getState().locked).toBe(false);
  });

  it.each<LockGraceMinutes>([1, 15])('saves %i minutes, and the lines name it', async (minutes) => {
    useSettingsStore.setState({ appLock: true });
    render(<SettingsView />);
    await screen.findByTestId('settings-lock-after');
    await enabled(minutes);
    await act(async () => {
      fireEvent.press(screen.getByTestId(`lock-after-${minutes}`));
    });
    await waitFor(() => expect(useSettingsStore.getState().appLockGraceMinutes).toBe(minutes));
    await waitFor(() => expect(chosen(minutes)).toBe(true));
    const unit = minutes === 1 ? '1 minute' : '15 minutes';
    expect(plain(screen.getByTestId('settings-lock-after-line').props.children)).toBe(
      `Come back within ${unit} and it opens without asking.`,
    );
    expect(plain(screen.getByTestId('toggle-app-lock-row').props.accessibilityHint)).toMatch(
      new RegExp(`^Locks Fairly Sure once you’ve been away from it for more than ${unit}, `),
    );
  });

  it('waits while a choice is saved: the chips are disabled and a second press does nothing', async () => {
    let finish: () => void = () => undefined;
    const setGrace = jest.fn(
      (minutes: LockGraceMinutes) =>
        new Promise<void>((resolve) => {
          finish = () => {
            useSettingsStore.setState({ appLockGraceMinutes: minutes });
            resolve();
          };
        }),
    );
    useSettingsStore.setState({ appLock: true, setAppLockGraceMinutes: setGrace });
    render(<SettingsView />);
    await screen.findByTestId('settings-lock-after');
    await enabled(15);
    await act(async () => {
      fireEvent.press(screen.getByTestId('lock-after-15'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('lock-after-1').props.accessibilityState?.disabled).toBe(true),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('lock-after-1'));
    });
    expect(setGrace).toHaveBeenCalledTimes(1);
    expect(setGrace).toHaveBeenCalledWith(15);

    await act(async () => {
      finish();
    });
    await enabled(1);
    expect(chosen(15)).toBe(true);
  });

  it('saves nothing when the chosen one is pressed again', async () => {
    const setGrace = jest.fn(realSetGrace);
    useSettingsStore.setState({ appLock: true, setAppLockGraceMinutes: setGrace });
    render(<SettingsView />);
    await screen.findByTestId('settings-lock-after');
    await enabled(5);
    await act(async () => {
      fireEvent.press(screen.getByTestId('lock-after-5'));
    });
    expect(setGrace).not.toHaveBeenCalled();
    expect(chosen(5)).toBe(true);
  });
});

describe('the lock switch in words', () => {
  it('never names Face ID on a phone without it', () => {
    expect(appLockLabel('Touch ID')).toBe('Lock with Touch ID');
    expect(appLockLabel('your passcode')).toBe('Lock with iPhone passcode');
    expect(appLockLine('ready', 'your passcode', false, 0)).toMatch(/^Locks Fairly Sure each time it opens or comes back to the front/);
    expect(appLockLine('ready', 'your passcode', false, 0)).toMatch(/Unlock opens it with your iPhone passcode\./);
    expect(appLockLine('ready', 'your passcode', false, 0)).not.toMatch(/Face ID|Touch ID/);
    expect(appLockLine('ready', 'Touch ID', false, 0)).toMatch(/Unlock opens it with Touch ID or your iPhone passcode\./);
    // The same with Lock after at its default.
    expect(appLockLine('ready', 'your passcode', false, 5)).toMatch(/Unlock opens it with your iPhone passcode\./);
    expect(appLockLine('ready', 'your passcode', false, 5)).not.toMatch(/Face ID|Touch ID/);
    expect(appLockLine('ready', 'Touch ID', false, 5)).toMatch(/Unlock opens it with Touch ID or your iPhone passcode\./);
  });

  // Policy audit of step 180: the line mustn't promise more than the lock does.
  it.each<LockGraceMinutes>([0, 5])('says reminders are not covered, and what changes on them, at %i minutes', (grace) => {
    const line = appLockLine('ready', 'Face ID', false, grace);
    expect(line).toMatch(/Reminders aren’t covered/);
    expect(line).toMatch(/no Happened or Didn’t/);
    expect(line).toMatch(/their own switch under Notifications/);
  });

  it('names the Settings page it is given when there is no passcode', () => {
    expect(appLockLine('no_passcode', 'your passcode', false, 5, 'Touch ID & Passcode')).toMatch(
      /Settings → Touch ID & Passcode/,
    );
    expect(appLockLine('no_passcode', 'your passcode', false, 5)).toMatch(/Face ID & Passcode/);
    // Lock after changes nothing on a phone that can't lock.
    expect(appLockLine('no_passcode', 'your passcode', false, 0)).toBe(
      appLockLine('no_passcode', 'your passcode', false, 15),
    );
  });

  it('puts the failed check first, whatever Lock after is', () => {
    expect(appLockLine('ready', 'Face ID', true, 0)).toMatch(
      /^That didn’t go through, so nothing changed\. Locks Fairly Sure each time/,
    );
    expect(plain(appLockLine('ready', 'Face ID', true, 5))).toMatch(
      /^That didn’t go through, so nothing changed\. Locks Fairly Sure once you’ve been away from it for more than 5 minutes,/,
    );
  });

  // With the lock on a reminder can't answer for you, so its line stops saying it can.
  it('stops promising Happened and Didn’t on reminders while the lock is on', () => {
    expect(reminderWordsLine(true)).toMatch(/Happened and Didn't to answer from it/);
    expect(reminderWordsLine(true, true)).not.toMatch(/Happened/);
    expect(reminderWordsLine(true, true)).toMatch(/opens the question behind the app lock/);
    expect(reminderWordsLine(false, true)).toBe(reminderWordsLine(false, false));
  });
});

// Roadmap D75: the words for each choice, pinned.
describe('Lock after in words', () => {
  const REST =
    ' Unlock opens it with Face ID or your iPhone passcode. For a phone someone else picks up. Reminders aren’t covered: while this is on they have no Happened or Didn’t, and their words have their own switch under Notifications.';

  it('names each choice, its count held to its unit', () => {
    expect(lockAfterLabel(0)).toBe('Immediately');
    expect(lockAfterLabel(1)).toBe(`1${NB}minute`);
    expect(lockAfterLabel(5)).toBe(`5${NB}minutes`);
    expect(lockAfterLabel(15)).toBe(`15${NB}minutes`);
  });

  it('says what each choice does, under the label', () => {
    expect(lockAfterLine(0)).toBe('It locks every time you leave it.');
    expect(lockAfterLine(1)).toBe(`Come back within 1${NB}minute and it opens without asking.`);
    expect(lockAfterLine(5)).toBe(`Come back within 5${NB}minutes and it opens without asking.`);
    expect(lockAfterLine(15)).toBe(`Come back within 15${NB}minutes and it opens without asking.`);
  });

  it('gives the switch a first sentence for each choice, and keeps every other sentence word for word', () => {
    expect(appLockLine('ready', 'Face ID', false, 0)).toBe(
      `Locks Fairly Sure each time it opens or comes back to the front, and covers it in the app switcher.${REST}`,
    );
    expect(appLockLine('ready', 'Face ID', false, 1)).toBe(
      `Locks Fairly Sure once you’ve been away from it for more than 1${NB}minute, and covers it in the app switcher.${REST}`,
    );
    expect(appLockLine('ready', 'Face ID', false, 5)).toBe(
      `Locks Fairly Sure once you’ve been away from it for more than 5${NB}minutes, and covers it in the app switcher.${REST}`,
    );
    expect(appLockLine('ready', 'Face ID', false, 15)).toBe(
      `Locks Fairly Sure once you’ve been away from it for more than 15${NB}minutes, and covers it in the app switcher.${REST}`,
    );
  });

  // As the lock store reads it: a value that isn't a choice is Immediately,
  // the side that locks, so the words never promise a grace it won't give.
  it('reads a value that is not a choice as Immediately', () => {
    const odd = 7 as unknown as LockGraceMinutes;
    expect(lockAfterLabel(odd)).toBe('Immediately');
    expect(lockAfterLine(odd)).toBe('It locks every time you leave it.');
    expect(appLockLine('ready', 'Face ID', false, odd)).toBe(appLockLine('ready', 'Face ID', false, 0));
  });
});
