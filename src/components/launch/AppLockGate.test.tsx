import { AccessibilityInfo, AppState } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { __setLockDepsForTests, type LockDeps } from '@/lock/appLock';
import { __resetLockStoreForTests, useLockStore } from '@/store/lockStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';

import { AppLockGate, FAILED_LINE, lockedLine, NO_PASSCODE_LINE } from './AppLockGate';

type Result = { success: boolean; error?: string };
let answers: Result[];
let authenticateAsync: jest.Mock<Promise<Result>, []>;

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  answers = [];
  authenticateAsync = jest.fn(async () => answers.shift() ?? { success: true });
  const deps: LockDeps = {
    getEnrolledLevelAsync: async () => 3,
    supportedAuthenticationTypesAsync: async () => [2],
    authenticateAsync,
  };
  __setLockDepsForTests(deps);
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  __resetLockStoreForTests();
});

afterEach(() => {
  __setLockDepsForTests(undefined);
  __setPersistenceForTests(null);
  jest.restoreAllMocks();
});

/** Draw the gate with the app in front, as iOS reports it once launched. */
function renderInFront() {
  const view = render(<AppLockGate />);
  act(() => useLockStore.getState().appPhaseChanged('active'));
  return view;
}

// Roadmap D64 (step 180).
describe('AppLockGate', () => {
  it('draws nothing while the app is open and in front', () => {
    renderInFront();
    expect(screen.queryByTestId('app-lock')).toBeNull();
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
    expect(authenticateAsync).not.toHaveBeenCalled();
  });

  // D74 (the owner, 2026-11-21): nothing asks until Unlock is tapped.
  it('at launch shows its line and a ready Unlock, and asks nothing until it is tapped', async () => {
    useSettingsStore.setState({ appLock: true });
    useLockStore.getState().arm();
    renderInFront();
    const unlock = await screen.findByTestId('app-lock-unlock');
    await waitFor(() =>
      expect(screen.getByText(/Locked\. Unlock with Face ID or your iPhone passcode/)).toBeTruthy(),
    );
    expect(unlock.props.accessibilityState.disabled).toBe(false);
    expect(authenticateAsync).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(unlock);
    });
    await waitFor(() => expect(screen.queryByTestId('app-lock')).toBeNull());
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('holds Unlock while a prompt is up, so a second tap asks nothing', async () => {
    useSettingsStore.setState({ appLock: true });
    let finish: (r: Result) => void = () => {};
    authenticateAsync.mockImplementation(
      () =>
        new Promise<Result>((resolve) => {
          finish = resolve;
        }),
    );
    useLockStore.getState().arm();
    renderInFront();
    await act(async () => {
      fireEvent.press(screen.getByTestId('app-lock-unlock'));
    });
    const unlock = screen.getByTestId('app-lock-unlock');
    expect(unlock.props.accessibilityState.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(unlock);
    });
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ success: true });
    });
    await waitFor(() => expect(screen.queryByTestId('app-lock')).toBeNull());
  });

  it('stays up after a closed prompt, and Unlock asks again', async () => {
    useSettingsStore.setState({ appLock: true });
    answers = [{ success: false, error: 'user_cancel' }];
    useLockStore.getState().arm();
    renderInFront();
    await act(async () => {
      fireEvent.press(screen.getByTestId('app-lock-unlock'));
    });
    const unlock = await screen.findByTestId('app-lock-unlock');
    await waitFor(() => expect(unlock.props.accessibilityState.disabled).toBe(false));
    expect(screen.getByText(/Locked\. Unlock with Face ID or your iPhone passcode/)).toBeTruthy();
    // No words about a failure: closing the prompt isn't one.
    expect(screen.queryByTestId('app-lock-failed')).toBeNull();
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.press(unlock);
    });
    await waitFor(() => expect(screen.queryByTestId('app-lock')).toBeNull());
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
  });

  it('says when a check failed', async () => {
    useSettingsStore.setState({ appLock: true });
    answers = [{ success: false, error: 'not_available' }];
    useLockStore.getState().arm();
    renderInFront();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await act(async () => {
      fireEvent.press(screen.getByTestId('app-lock-unlock'));
    });
    expect(await screen.findByTestId('app-lock-failed')).toBeTruthy();
    expect(screen.getByTestId('app-lock-unlock')).toBeTruthy();
    // Spoken: VoiceOver hears nothing change on its own.
    expect(announce).toHaveBeenCalledWith(FAILED_LINE);
  });

  it('opens, with the lock turned off, on a phone that lost its passcode', async () => {
    useSettingsStore.setState({ appLock: true });
    answers = [{ success: false, error: 'passcode_not_set' }];
    useLockStore.getState().arm();
    renderInFront();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await act(async () => {
      fireEvent.press(screen.getByTestId('app-lock-unlock'));
    });
    expect(await screen.findByTestId('app-lock-no-passcode')).toBeTruthy();
    expect(screen.queryByTestId('app-lock-unlock')).toBeNull();
    expect(announce).toHaveBeenCalledWith(NO_PASSCODE_LINE);
    await act(async () => {
      fireEvent.press(screen.getByTestId('app-lock-continue'));
    });
    await waitFor(() => expect(screen.queryByTestId('app-lock')).toBeNull());
    expect(useSettingsStore.getState().appLock).toBe(false);
  });

  it('covers the app with its name alone while it is not in front', () => {
    useSettingsStore.setState({ appLock: true });
    render(<AppLockGate />);
    act(() => useLockStore.getState().appPhaseChanged('inactive'));
    expect(screen.getByTestId('app-lock-cover')).toBeTruthy();
    expect(screen.getByText('Fairly Sure')).toBeTruthy();
    expect(screen.queryByTestId('app-lock-unlock')).toBeNull();
    act(() => useLockStore.getState().appPhaseChanged('active'));
    expect(screen.queryByTestId('app-lock-cover')).toBeNull();
  });
});

// The gate is what tells the store where the app is: without its listener
// nothing would lock on the way out or uncover on the way back.
describe('AppLockGate and the app going in and out of the foreground', () => {
  // With "Lock after" Immediately (D75), which locks on every trip away as
  // the lock did before it; within the default 5 minutes a return opens
  // straight in (src/store/lockStore.test.ts).
  it('follows iOS: covers on inactive, locks on background, waits for Unlock on return', async () => {
    const add = jest.spyOn(AppState, 'addEventListener');
    useSettingsStore.setState({ appLock: true, appLockGraceMinutes: 0 });
    render(<AppLockGate />);
    const change = add.mock.calls.filter(([type]) => type === 'change').pop();
    expect(change).toBeDefined();
    const fire = change![1] as (next: string) => void;

    act(() => fire('active'));
    expect(screen.queryByTestId('app-lock')).toBeNull();
    act(() => fire('inactive'));
    expect(screen.getByTestId('app-lock-cover')).toBeTruthy();
    act(() => fire('background'));
    expect(screen.getByTestId('app-lock')).toBeTruthy();
    expect(authenticateAsync).not.toHaveBeenCalled();
    act(() => fire('inactive'));
    expect(authenticateAsync).not.toHaveBeenCalled();
    await act(async () => {
      fire('active');
    });
    // Back in front: the lock screen, its Unlock ready, and no prompt (D74).
    const unlock = screen.getByTestId('app-lock-unlock');
    expect(unlock.props.accessibilityState.disabled).toBe(false);
    expect(authenticateAsync).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(unlock);
    });
    await waitFor(() => expect(screen.queryByTestId('app-lock')).toBeNull());
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it('stops listening when it goes', () => {
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove } as never);
    const view = render(<AppLockGate />);
    view.unmount();
    expect(remove).toHaveBeenCalled();
  });
});

// The lines and the button are taller than the screen at the largest text
// sizes, and the button is the way in (code review of step 180).
describe('AppLockGate at large text', () => {
  it('scrolls, and caps only the name', async () => {
    useSettingsStore.setState({ appLock: true });
    useLockStore.getState().arm();
    renderInFront();
    const screenView = await screen.findByTestId('app-lock');
    // A ScrollView: it has a content container to grow and centre in.
    expect(screenView.props.contentContainerStyle).toBeDefined();
    expect(screenView.props.alwaysBounceVertical).toBe(false);
    expect(screen.getByText('Fairly Sure').props.maxFontSizeMultiplier).toBeDefined();
    expect(screen.getByText(/^Locked\./).props.maxFontSizeMultiplier).toBeUndefined();
  });
});

// HIG: name only a method this phone has.
describe('lockedLine', () => {
  it('names what this phone unlocks with', () => {
    expect(lockedLine('Face ID')).toBe(
      'Locked. Unlock with Face ID or your iPhone passcode to see your predictions.',
    );
    expect(lockedLine('Touch ID')).toMatch(/Touch ID or your iPhone passcode/);
    expect(lockedLine('your passcode')).toBe(
      'Locked. Unlock with your iPhone passcode to see your predictions.',
    );
    expect(lockedLine(null)).toBe('Locked. Unlock to see your predictions.');
    expect(lockedLine('your passcode')).not.toMatch(/Face ID|Touch ID/);
  });
});
