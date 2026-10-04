import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';

import { usePredictionStore } from '@/store/predictionStore';

import { GUARD_OPTIONS, useReflectionGuard } from './useReflectionGuard';

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
let reflect: jest.Mock;

beforeEach(() => {
  mockPrevented = false;
  mockOnPrevent = null;
  mockDispatch.mockReset();
  reflect = jest.fn().mockResolvedValue(undefined);
  usePredictionStore.setState({ reflect });
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  jest.restoreAllMocks();
});

describe('useReflectionGuard', () => {
  it('stays out of the way when nothing has been typed', () => {
    renderHook(() => useReflectionGuard('p1', '   '));
    expect(mockPrevented).toBe(false);
  });

  it('holds the sheet open and asks, with Save first', () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => {});
    renderHook(() => useReflectionGuard('p1', 'lucky timing'));
    expect(mockPrevented).toBe(true);

    tryToLeave();

    expect(sheet).toHaveBeenCalledTimes(1);
    expect(sheet.mock.calls[0][0]).toMatchObject({
      options: [...GUARD_OPTIONS],
      destructiveButtonIndex: 1,
      cancelButtonIndex: 2,
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('saves the reflection, then leaves', async () => {
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, choose) => choose(0));
    renderHook(() => useReflectionGuard('p1', 'lucky timing'));

    tryToLeave();

    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(ACTION));
    expect(reflect).toHaveBeenCalledWith('p1', 'lucky timing');
  });

  it('discards without saving', () => {
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, choose) => choose(1));
    renderHook(() => useReflectionGuard('p1', 'lucky timing'));

    tryToLeave();

    expect(mockDispatch).toHaveBeenCalledWith(ACTION);
    expect(reflect).not.toHaveBeenCalled();
  });

  it('keeps editing: neither saves nor leaves', () => {
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, choose) => choose(2));
    renderHook(() => useReflectionGuard('p1', 'lucky timing'));

    tryToLeave();

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(reflect).not.toHaveBeenCalled();
  });

  it('stays on the sheet if the save fails', async () => {
    reflect.mockRejectedValue(new Error('disk full'));
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, choose) => choose(0));
    renderHook(() => useReflectionGuard('p1', 'lucky timing'));

    tryToLeave();

    await waitFor(() => expect(reflect).toHaveBeenCalled());
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('lets a deliberate exit through without asking', () => {
    const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions');
    const { result } = renderHook(() => useReflectionGuard('p1', 'lucky timing'));

    result.current.markLeaving();
    tryToLeave();

    expect(sheet).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(ACTION);
  });

  it('asks with an alert on Android', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderHook(() => useReflectionGuard('p1', 'lucky timing'));

    tryToLeave();

    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0][2] ?? [];
    expect(buttons.map((b) => b.text)).toEqual(['Keep editing', 'Discard', 'Save']);
  });

  it('saves without asking on web, which has no action sheet', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    renderHook(() => useReflectionGuard('p1', 'lucky timing'));

    tryToLeave();

    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(ACTION));
    expect(reflect).toHaveBeenCalledWith('p1', 'lucky timing');
  });
});
