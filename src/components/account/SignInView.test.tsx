import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useAuthStore } from '@/store/authStore';

import { SignInView } from './SignInView';

// The real button loads a native module; its presence is all these tests need.
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));

jest.mock('./AppleSignInButton', () => {
  const { Platform: P, Pressable } = jest.requireActual('react-native');
  return {
    AppleSignInButton: ({ onPress }: { onPress: () => void }) =>
      P.OS === 'ios' ? <Pressable testID="account-apple" onPress={onPress} /> : null,
  };
});

const signInWithEmail = jest.fn();
const signUpWithEmail = jest.fn();
const signInWithApple = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    pending: false,
    signInWithEmail,
    signUpWithEmail,
    signInWithApple,
  });
});

function fill(email: string, password: string) {
  fireEvent.changeText(screen.getByTestId('account-email'), email);
  fireEvent.changeText(screen.getByTestId('account-password'), password);
}

describe('SignInView', () => {
  it('signs in by email and finishes', async () => {
    signInWithEmail.mockResolvedValue({ ok: true });
    const onDone = jest.fn();
    render(<SignInView onDone={onDone} />);

    fill('a@b.co', 'hunter22');
    fireEvent.press(screen.getByTestId('account-submit'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(signInWithEmail).toHaveBeenCalledWith('a@b.co', 'hunter22');
  });

  it('shows the error and stays put when sign-in fails', async () => {
    signInWithEmail.mockResolvedValue({ ok: false, error: 'Invalid login credentials' });
    const onDone = jest.fn();
    render(<SignInView onDone={onDone} />);

    fill('a@b.co', 'wrong');
    fireEvent.press(screen.getByTestId('account-submit'));

    expect(await screen.findByText('Invalid login credentials')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('creates an account from the other mode', async () => {
    signUpWithEmail.mockResolvedValue({ ok: true, needsConfirmation: false });
    const onDone = jest.fn();
    render(<SignInView onDone={onDone} />);

    fireEvent.press(screen.getByTestId('account-mode-signUp'));
    expect(screen.getByText('Create an account')).toBeTruthy();
    fill('a@b.co', 'hunter22');
    fireEvent.press(screen.getByTestId('account-submit'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(signUpWithEmail).toHaveBeenCalledWith('a@b.co', 'hunter22');
  });

  // With "Confirm email" on there is no session yet. Finishing here would drop
  // the user back into Settings still signed out, with no idea why.
  it('asks the user to confirm by email instead of finishing', async () => {
    signUpWithEmail.mockResolvedValue({ ok: true, needsConfirmation: true });
    const onDone = jest.fn();
    render(<SignInView onDone={onDone} />);

    fireEvent.press(screen.getByTestId('account-mode-signUp'));
    fill('a@b.co', 'hunter22');
    fireEvent.press(screen.getByTestId('account-submit'));

    expect(await screen.findByTestId('account-notice')).toHaveTextContent(/a@b\.co/);
    expect(onDone).not.toHaveBeenCalled();
    // Back in sign-in mode, ready for when they return from the email: the
    // switch says so as well as the button.
    expect(screen.getByTestId('account-submit')).toHaveTextContent('Sign in');
    expect(screen.getByTestId('account-mode-signIn')).toBeSelected();
    expect(screen.getByTestId('account-mode-signUp')).not.toBeSelected();
    expect(screen.queryByTestId('account-password-hint')).toBeNull();
    expect(screen.getByTestId('account-email').props.value).toBe('a@b.co');

    // Tapping Sign in, already chosen, leaves the notice where it is.
    fireEvent.press(screen.getByTestId('account-mode-signIn'));
    expect(screen.getByTestId('account-notice')).toHaveTextContent(/a@b\.co/);
  });

  // Owner, 2026-11-17 (TestFlight): a text link at the bottom flipped the
  // mode and only the words changed. A two-segment switch above the email
  // field shows which one is chosen.
  describe('the Sign in / Create account switch', () => {
    it('starts on Sign in, with no password hint', () => {
      render(<SignInView onDone={jest.fn()} />);

      expect(screen.getByLabelText('Account').props.accessibilityRole).toBe('radiogroup');
      expect(screen.getByTestId('account-mode-signIn').props.accessibilityRole).toBe('radio');
      expect(screen.getByTestId('account-mode-signIn')).toBeSelected();
      expect(screen.getByTestId('account-mode-signUp')).not.toBeSelected();
      expect(screen.getByTestId('account-mode-signIn')).toHaveTextContent('Sign in');
      expect(screen.getByTestId('account-mode-signUp')).toHaveTextContent('Create account');
      expect(screen.queryByTestId('account-password-hint')).toBeNull();
      expect(screen.queryByTestId('account-switch-mode')).toBeNull();
    });

    it('switches to Create account and back, clearing an error', async () => {
      signInWithEmail.mockResolvedValue({ ok: false, error: 'Invalid login credentials' });
      render(<SignInView onDone={jest.fn()} />);

      fill('a@b.co', 'wrong');
      fireEvent.press(screen.getByTestId('account-submit'));
      expect(await screen.findByTestId('account-error')).toHaveTextContent(
        'Invalid login credentials',
      );

      fireEvent.press(screen.getByTestId('account-mode-signUp'));
      expect(screen.getByTestId('account-mode-signUp')).toBeSelected();
      expect(screen.getByTestId('account-mode-signIn')).not.toBeSelected();
      expect(screen.getByTestId('account-password-hint')).toHaveTextContent(
        'At least 8 characters.',
      );
      expect(screen.getByRole('header')).toHaveTextContent('Create an account');
      expect(screen.getByTestId('account-submit')).toHaveTextContent('Create account');
      expect(screen.queryByTestId('account-error')).toBeNull();

      fireEvent.press(screen.getByTestId('account-mode-signIn'));
      expect(screen.getByTestId('account-mode-signIn')).toBeSelected();
      expect(screen.getByTestId('account-mode-signUp')).not.toBeSelected();
      expect(screen.queryByTestId('account-password-hint')).toBeNull();
      expect(screen.getByRole('header')).toHaveTextContent('Sign in');
      expect(screen.getByTestId('account-submit')).toHaveTextContent('Sign in');
    });
  });

  it('disables submit while an action is in flight', () => {
    useAuthStore.setState({ pending: true });
    render(<SignInView onDone={jest.fn()} />);

    expect(screen.getByTestId('account-submit')).toBeDisabled();
  });

  describe('Sign in with Apple', () => {
    const original = Platform.OS;
    afterEach(() => {
      Platform.OS = original;
    });

    it('is offered on iOS', async () => {
      Platform.OS = 'ios';
      signInWithApple.mockResolvedValue({ ok: true });
      const onDone = jest.fn();
      render(<SignInView onDone={onDone} />);

      fireEvent.press(screen.getByTestId('account-apple'));
      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    });

    it('is not offered on Android', () => {
      Platform.OS = 'android';
      render(<SignInView onDone={jest.fn()} />);

      expect(screen.queryByTestId('account-apple')).toBeNull();
    });
  });
});

// Policy audit, 2026-11-14 (guideline 5.1.1(ii)): usage stats are on by
// default and go up with the account from sign-in on, and the screen that
// creates the account said nothing about them.
describe('SignInView — what signing in sends', () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { useSettingsStore } = require('@/store/settingsStore') as typeof import('@/store/settingsStore');
  const { PRIVACY_POLICY_URL } = require('@/constants/app') as typeof import('@/constants/app');
  /* eslint-enable @typescript-eslint/no-var-requires */
  afterEach(() => useSettingsStore.setState({ analyticsEnabled: true }));

  it('says usage counts go with the account, and how to turn them off', () => {
    render(<SignInView onDone={jest.fn()} />);
    expect(screen.getByTestId('account-usage-note')).toHaveTextContent(
      'Once you’re signed in, a record of which features you use, including what’s already on this phone, is sent with your account: numbers and yes/no values, never the words of your predictions or notes. You can turn that off in You, under Usage stats.',
    );
  });

  it('says nothing about them once they are off', () => {
    useSettingsStore.setState({ analyticsEnabled: false });
    render(<SignInView onDone={jest.fn()} />);
    expect(screen.queryByTestId('account-usage-note')).toBeNull();
  });

  it('opens the privacy policy', () => {
    const { openBrowserAsync } = jest.requireMock('expo-web-browser');
    render(<SignInView onDone={jest.fn()} />);
    fireEvent.press(screen.getByTestId('account-privacy-link'));
    expect(openBrowserAsync).toHaveBeenLastCalledWith(PRIVACY_POLICY_URL);
  });
});
