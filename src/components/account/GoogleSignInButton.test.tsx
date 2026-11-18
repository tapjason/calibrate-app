import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { GOOGLE_BUTTON_LABEL, GoogleSignInButton } from './GoogleSignInButton';

// The flag, switchable per test: a getter, read only when the button renders
// (defined after the spread, which would otherwise read it at mock time).
const mockFlag = { on: true };
jest.mock('@/constants/app', () =>
  Object.defineProperty({ ...jest.requireActual('@/constants/app') }, 'GOOGLE_SIGN_IN_ENABLED', {
    enumerable: true,
    get: () => mockFlag.on,
  }),
);

const originalOS = Platform.OS;
function setOS(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

beforeEach(() => {
  mockFlag.on = true;
  // jest-expo runs as iOS; said here so a change of default can't pass quietly.
  setOS('ios');
});

afterAll(() => setOS(originalOS));

describe('GoogleSignInButton', () => {
  // Step 192: built and hidden until the owner has set Google up.
  it('renders nothing while the flag is off, the shipped value', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const actual = jest.requireActual('@/constants/app') as typeof import('@/constants/app');
    expect(actual.GOOGLE_SIGN_IN_ENABLED).toBe(false);

    mockFlag.on = false;
    render(<GoogleSignInButton onPress={jest.fn()} />);
    expect(screen.queryByTestId('account-google')).toBeNull();
    expect(screen.queryByText(GOOGLE_BUTTON_LABEL)).toBeNull();
  });

  // The web build's redirect can't use the app's scheme.
  it.each(['android', 'web'] as const)('renders nothing on %s, flag or not', (os) => {
    setOS(os);
    render(<GoogleSignInButton onPress={jest.fn()} />);
    expect(screen.queryByTestId('account-google')).toBeNull();
  });

  it("is a button labelled in Google's approved words, with the G before them", () => {
    render(<GoogleSignInButton onPress={jest.fn()} />);
    const button = screen.getByTestId('account-google');

    expect(GOOGLE_BUTTON_LABEL).toBe('Continue with Google');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Continue with Google');
    expect(button).toHaveTextContent('Continue with Google');
    expect(button).toBeEnabled();

    // The four-colour G, a 20 pt square, ahead of the label.
    const mark = screen.getByTestId('account-google-mark');
    expect(StyleSheet.flatten(mark.props.style)).toMatchObject({ width: 20, height: 20 });
  });

  it('draws the label in the system font, capped for large text', () => {
    render(<GoogleSignInButton onPress={jest.fn()} />);
    const label = screen.getByText('Continue with Google');
    const style = StyleSheet.flatten(label.props.style);

    expect(style.fontFamily).toBeUndefined();
    expect(style.fontWeight).toBe('500');
    expect(label.props.maxFontSizeMultiplier).toBe(1.3);
  });

  it("has Apple's footprint: full width, 48 pt, corner radius 8", () => {
    render(<GoogleSignInButton onPress={jest.fn()} />);
    const style = StyleSheet.flatten(screen.getByTestId('account-google').props.style);

    expect(style).toMatchObject({ width: '100%', minHeight: 48, borderRadius: 8, borderWidth: 1 });
    expect(style.opacity).toBeUndefined();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<GoogleSignInButton onPress={onPress} />);

    fireEvent.press(screen.getByTestId('account-google'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // As Apple's button while a sign-in is in flight.
  it('dims to 0.4 and ignores taps while disabled', () => {
    const onPress = jest.fn();
    render(<GoogleSignInButton onPress={onPress} disabled />);
    const button = screen.getByTestId('account-google');

    expect(button).toBeDisabled();
    expect(StyleSheet.flatten(button.props.style).opacity).toBe(0.4);
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
