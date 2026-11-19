import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { renderHook } from '@testing-library/react-native';

import { __resetLockStoreForTests, useLockStore } from '@/store/lockStore';

import {
  EDIT_GUARD_OPTIONS,
  LOG_GUARD_OPTIONS,
  useEditDraftGuard,
  useLogDraftGuard,
} from './useLogDraftGuard';

type Callback = (options: { data: { action: { type: string } } }) => void;

let mockPrevented = false;
let mockOnPrevent: Callback | null = null;
const mockDispatch = jest.fn();

jest.mock('@react-navigation/native', () => ({
  usePreventRemove: (prevent: boolean, cb: Callback) => {
    mockPrevented = prevent;
    mockOnPrevent = cb;
  },
}));

jest.mock('expo-router', () => ({
  useNavigation: () => ({ dispatch: mockDispatch }),
}));

const ACTION = { type: 'POP' };
const tryToLeave = () => mockOnPrevent?.({ data: { action: ACTION } });

const originalOS = Platform.OS;

beforeEach(() => {
  mockPrevented = false;
  mockOnPrevent = null;
  mockDispatch.mockReset();
  __resetLockStoreForTests();
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  __resetLockStoreForTests();
  jest.restoreAllMocks();
});

describe('useLogDraftGuard', () => {
  it('stays out of the way with nothing typed', () => {
    renderHook(() => useLogDraftGuard(false));
    expect(mockPrevented).toBe(false);
  });

  it('asks with the action sheet, Discard first', () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => {});
    renderHook(() => useLogDraftGuard(true));
    expect(mockPrevented).toBe(true);

    tryToLeave();

    expect(sheet.mock.calls[0][0]).toMatchObject({
      options: [...LOG_GUARD_OPTIONS],
      destructiveButtonIndex: 0,
      cancelButtonIndex: 1,
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('discards the draft and leaves on Discard', () => {
    const onDiscard = jest.fn();
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, choose) => choose(0));
    renderHook(() => useLogDraftGuard(true, onDiscard));

    tryToLeave();

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(ACTION);
  });

  it('keeps editing on Keep editing', () => {
    const onDiscard = jest.fn();
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, choose) => choose(1));
    renderHook(() => useLogDraftGuard(true, onDiscard));

    tryToLeave();

    expect(onDiscard).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

// Security review, 2026-11-18: a system sheet or alert can sit above the app
// lock, so Discard pressed in it while the app is locked does nothing.
describe('useLogDraftGuard while the app is locked', () => {
  it('ignores Discard on the action sheet: the draft and the sheet stay', () => {
    const onDiscard = jest.fn();
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, choose) => {
        // Locked while the sheet was up, then pressed.
        useLockStore.setState({ locked: true });
        choose(0);
      });
    renderHook(() => useLogDraftGuard(true, onDiscard));

    tryToLeave();

    expect(onDiscard).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("ignores Discard on Edit's action sheet too", () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, choose) => {
        useLockStore.setState({ locked: true });
        choose(0);
      });
    renderHook(() => useEditDraftGuard(true));

    tryToLeave();

    expect(sheet.mock.calls[0][0]).toMatchObject({ options: [...EDIT_GUARD_OPTIONS] });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('ignores Discard on the Android alert', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    const onDiscard = jest.fn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderHook(() => useLogDraftGuard(true, onDiscard));

    tryToLeave();
    useLockStore.setState({ locked: true });
    const discard = (alert.mock.calls[0][2] ?? []).find((b) => b.text === 'Discard');
    discard?.onPress?.();

    expect(discard).toBeDefined();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('discards as before once the lock is open again', () => {
    const onDiscard = jest.fn();
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, choose) => choose(0));
    useLockStore.setState({ locked: false });
    renderHook(() => useLogDraftGuard(true, onDiscard));

    tryToLeave();

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(ACTION);
  });
});
