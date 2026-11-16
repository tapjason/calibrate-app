import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { palettes } from '@/constants/theme';
import { __resetLockStoreForTests, useLockStore } from '@/store/lockStore';

import { LaunchButton, launchInk, LaunchLine, LaunchPage, MARK_SIZE } from './LaunchPage';
import { LAUNCH_HOLD_MS, LAUNCH_OUT_MS, LaunchScreen } from './LaunchScreen';

// The mark, and the whole launch overlay, are hidden from VoiceOver.
const HIDDEN = { includeHiddenElements: true };

// Step 187: the launch page, shared by the launch, the app lock and the wait
// before the database opens.
describe('LaunchPage', () => {
  it('is the splash: its ink in each appearance, and the mark at the splash’s size', () => {
    expect(launchInk('light')).toBe('#15171B');
    expect(launchInk('dark')).toBe('#0E0F12');
    render(<LaunchPage />);
    expect(screen.getByTestId('launch-mark', HIDDEN).props.style).toMatchObject({
      height: MARK_SIZE,
      width: MARK_SIZE,
    });
    expect(MARK_SIZE).toBe(200);
  });

  it('names the app as a header, capped at the display scale, with what it is given under it', () => {
    render(
      <LaunchPage testID="page">
        <Text>Under the name</Text>
      </LaunchPage>,
    );
    const name = screen.getByText('Fairly Sure');
    expect(name.props.accessibilityRole).toBe('header');
    expect(name.props.maxFontSizeMultiplier).toBeDefined();
    expect(screen.getByText('Under the name')).toBeTruthy();
    expect(screen.getByTestId('page')).toBeTruthy();
  });

  it('can show the mark alone, as the native splash does', () => {
    render(<LaunchPage markOnly />);
    expect(screen.getByTestId('launch-mark', HIDDEN)).toBeTruthy();
    expect(screen.queryByText('Fairly Sure')).toBeNull();
  });

  // The app's own primary button is ink in the light appearance, the page's
  // colour; this one is always the light capsule with an ink label.
  it('draws its button and line in fixed colours that read on the ink', () => {
    const onPress = jest.fn();
    render(
      <>
        <LaunchLine testID="line">Locked.</LaunchLine>
        <LaunchButton label="Unlock" onPress={onPress} testID="go" />
      </>,
    );
    expect(screen.getByTestId('line').props.style).toMatchObject({
      color: palettes.dark.textSecondary,
    });
    expect(screen.getByText('Unlock').props.style).toMatchObject({ color: palettes.dark.onAction });
    fireEvent.press(screen.getByTestId('go'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('says when its button is off, and ignores a press then', () => {
    const onPress = jest.fn();
    render(<LaunchButton label="Unlock" onPress={onPress} disabled testID="go" />);
    expect(screen.getByTestId('go').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('go'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('LaunchScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetLockStoreForTests();
  });
  afterEach(() => {
    jest.useRealTimers();
    __resetLockStoreForTests();
  });

  it('stays up until the app is ready, however long that takes', () => {
    render(<LaunchScreen started={false} />);
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(screen.getByTestId('launch-screen', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Fairly Sure', HIDDEN)).toBeTruthy();
  });

  it('holds about a second once the app is ready, then goes', () => {
    const view = render(<LaunchScreen started={false} />);
    view.rerender(<LaunchScreen started />);
    act(() => {
      jest.advanceTimersByTime(LAUNCH_HOLD_MS - 1);
    });
    expect(screen.getByTestId('launch-screen', HIDDEN).props.pointerEvents).toBe('auto');
    // Fading: taps already reach the screen underneath.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByTestId('launch-screen', HIDDEN).props.pointerEvents).toBe('none');
    act(() => {
      jest.advanceTimersByTime(LAUNCH_OUT_MS);
    });
    expect(screen.queryByTestId('launch-screen', HIDDEN)).toBeNull();
  });

  it('is hidden from VoiceOver: the screen underneath is where it starts', () => {
    render(<LaunchScreen started={false} />);
    const page = screen.getByTestId('launch-screen', HIDDEN);
    expect(page.props.accessibilityElementsHidden).toBe(true);
    expect(page.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  // The lock screen is the same page, in front; after the unlock the app is there.
  it('stands aside when the app lock is up', () => {
    useLockStore.setState({ locked: true });
    const view = render(<LaunchScreen started={false} />);
    view.rerender(<LaunchScreen started />);
    expect(screen.queryByTestId('launch-screen', HIDDEN)).toBeNull();
  });
});
