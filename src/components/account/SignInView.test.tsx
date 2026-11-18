import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useAuthStore } from '@/store/authStore';

import { SignInView } from './SignInView';

// The screen as shipped, with "Continue with Google" on (since 2026-11-18),
// stated here so these hold whatever src/constants/app.ts says. Google itself
// is SignInView.google.test.tsx's; the flag off, SignInView.googleOff.test.tsx's.
jest.mock('@/constants/app', () => ({
  ...jest.requireActual('@/constants/app'),
  GOOGLE_SIGN_IN_ENABLED: true,
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));

// The real button loads a native module; its presence is all these tests need.
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
    fill('a@b.co', 'Hunter22');
    fireEvent.press(screen.getByTestId('account-submit'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(signUpWithEmail).toHaveBeenCalledWith('a@b.co', 'Hunter22');
  });

  // With "Confirm email" on there is no session yet. Finishing here would drop
  // the user back into Settings still signed out, with no idea why.
  it('asks the user to confirm by email instead of finishing', async () => {
    signUpWithEmail.mockResolvedValue({ ok: true, needsConfirmation: true });
    const onDone = jest.fn();
    render(<SignInView onDone={onDone} />);

    fireEvent.press(screen.getByTestId('account-mode-signUp'));
    fill('a@b.co', 'Hunter22');
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
      expect(screen.getByTestId('account-password-hint')).toBeTruthy();
      expect(screen.getByTestId('account-password-rule-length')).toHaveTextContent(
        '8 or more characters',
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

  // Step 190 (owner): Create account asks for more than 8 characters. The
  // rules are listed under the field from the start and tick off as typed.
  describe("Create account's password checklist", () => {
    const RULES = [
      ['length', '8 or more characters'],
      ['upper', 'An uppercase letter'],
      ['lower', 'A lowercase letter'],
      ['digit', 'A number'],
    ] as const;

    function row(key: string) {
      return screen.getByTestId(`account-password-rule-${key}`);
    }
    function icon(key: string) {
      return screen.getByTestId(`account-password-rule-${key}-icon`, {
        includeHiddenElements: true,
      });
    }
    /** Which rules read as met, by their spoken label. */
    function metKeys() {
      return RULES.filter(([key, label]) => {
        const spoken = row(key).props.accessibilityLabel;
        if (spoken === `${label}, met`) return true;
        expect(spoken).toBe(`${label}, not met`);
        return false;
      }).map(([key]) => key);
    }

    it('is shown only in Create account, from the start', () => {
      render(<SignInView onDone={jest.fn()} />);
      expect(screen.queryByTestId('account-password-hint')).toBeNull();
      for (const [key] of RULES) {
        expect(screen.queryByTestId(`account-password-rule-${key}`)).toBeNull();
      }

      fireEvent.press(screen.getByTestId('account-mode-signUp'));
      expect(screen.getByTestId('account-password-hint')).toBeTruthy();
      for (const [key, label] of RULES) {
        expect(row(key)).toHaveTextContent(label);
      }
      expect(screen.queryByText('At least 8 characters.')).toBeNull();

      fireEvent.press(screen.getByTestId('account-mode-signIn'));
      expect(screen.queryByTestId('account-password-hint')).toBeNull();
      // Typing in Sign in shows nothing either.
      fill('a@b.co', 'x');
      expect(screen.queryByTestId('account-password-rule-length')).toBeNull();
    });

    it('starts with every rule unmet, as hollow circles in quieter text', () => {
      render(<SignInView onDone={jest.fn()} />);
      fireEvent.press(screen.getByTestId('account-mode-signUp'));

      expect(metKeys()).toEqual([]);
      for (const [key, label] of RULES) {
        expect(row(key).props.accessibilityLabel).toBe(`${label}, not met`);
        expect(row(key).props.accessibilityRole).toBe('text');
        expect(row(key).props.accessible).toBe(true);
        expect(icon(key).props.name).toBe('circle');
        expect(icon(key).props.fallback.props.name).toBe('ellipse-outline');
      }
    });

    it('ticks each rule off as the password changes, and back', () => {
      render(<SignInView onDone={jest.fn()} />);
      fireEvent.press(screen.getByTestId('account-mode-signUp'));
      const typed = (password: string) =>
        fireEvent.changeText(screen.getByTestId('account-password'), password);

      typed('a');
      expect(metKeys()).toEqual(['lower']);
      typed('aB');
      expect(metKeys()).toEqual(['upper', 'lower']);
      typed('aB3');
      expect(metKeys()).toEqual(['upper', 'lower', 'digit']);
      typed('aB3defgh');
      expect(metKeys()).toEqual(['length', 'upper', 'lower', 'digit']);
      for (const [key, label] of RULES) {
        expect(screen.getByLabelText(`${label}, met`)).toBe(row(key));
        expect(icon(key).props.name).toBe('checkmark.circle.fill');
        expect(icon(key).props.fallback.props.name).toBe('checkmark-circle');
      }

      // Letters and digits outside ASCII don't count, as on the server.
      typed('ÉSSß１２３４');
      expect(metKeys()).toEqual(['length', 'upper']);
      typed('');
      expect(metKeys()).toEqual([]);
      expect(icon('length').props.name).toBe('circle');
    });

    it('announces nothing as the password is typed', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { AccessibilityInfo } = require('react-native') as typeof import('react-native');
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      render(<SignInView onDone={jest.fn()} />);
      fireEvent.press(screen.getByTestId('account-mode-signUp'));
      fireEvent.changeText(screen.getByTestId('account-password'), 'aB3defgh');

      expect(announce).not.toHaveBeenCalled();
      expect(screen.getByTestId('account-password-hint').props.accessibilityLiveRegion).toBeUndefined();
      for (const [key] of RULES) {
        expect(row(key).props.accessibilityLiveRegion).toBeUndefined();
      }
      announce.mockRestore();
    });

    // As a short password did before: the button stays enabled and the
    // refusal comes on submit, now naming what's missing. Here through the
    // real sign-up check, which refuses before reaching the server.
    it('refuses on submit with what is missing, button still enabled', async () => {
      /* eslint-disable @typescript-eslint/no-var-requires */
      const auth = require('@/supabase/auth') as typeof import('@/supabase/auth');
      const { setSupabaseClientForTests } = require('@/supabase/client') as typeof import('@/supabase/client');
      /* eslint-enable @typescript-eslint/no-var-requires */
      const signUp = jest.fn();
      setSupabaseClientForTests({ auth: { signUp } } as unknown as Parameters<
        typeof setSupabaseClientForTests
      >[0]);
      const realSignUp = jest.fn(auth.signUpWithEmail);
      useAuthStore.setState({ signUpWithEmail: realSignUp });
      const onDone = jest.fn();
      try {
        render(<SignInView onDone={onDone} />);
        fireEvent.press(screen.getByTestId('account-mode-signUp'));
        fill('a@b.co', 'hunter22');

        expect(screen.getByTestId('account-submit')).toBeEnabled();
        fireEvent.press(screen.getByTestId('account-submit'));

        expect(await screen.findByTestId('account-error')).toHaveTextContent(
          'Your password needs an uppercase letter.',
        );
        expect(realSignUp).toHaveBeenCalledWith('a@b.co', 'hunter22');
        expect(signUp).not.toHaveBeenCalled();
        expect(onDone).not.toHaveBeenCalled();
        // Still on Create account, the checklist showing the one rule left.
        expect(screen.getByTestId('account-mode-signUp')).toBeSelected();
        expect(metKeys()).toEqual(['length', 'lower', 'digit']);
        expect(screen.getByTestId('account-submit')).toBeEnabled();
      } finally {
        setSupabaseClientForTests(null);
      }
    });

    it("doesn't hold Sign in to the rules", async () => {
      signInWithEmail.mockResolvedValue({ ok: true });
      const onDone = jest.fn();
      render(<SignInView onDone={onDone} />);

      fill('a@b.co', 'hunter');
      expect(screen.getByTestId('account-submit')).toBeEnabled();
      fireEvent.press(screen.getByTestId('account-submit'));

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(signInWithEmail).toHaveBeenCalledWith('a@b.co', 'hunter');
      expect(screen.queryByTestId('account-error')).toBeNull();
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
