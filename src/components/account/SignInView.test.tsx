import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { WARMUP_USAGE_NOTE } from '@/components/warmup/UsageStatsNotice';
import { colors } from '@/constants/theme';
import { countUnsyncedEvents, enqueueEvent } from '@/db/analytics';
import { setDbForTests } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { useAuthStore } from '@/store/authStore';

import { SignInView, USAGE_NOTE, USAGE_OFF_NOTE } from './SignInView';

// The screen with "Continue with Google" on (since 2026-11-18), stated here
// so these hold whatever src/constants/app.ts says. Google itself is
// SignInView.google.test.tsx's; the flag off, SignInView.googleOff.test.tsx's.
jest.mock('@/constants/app', () => ({
  ...jest.requireActual('@/constants/app'),
  GOOGLE_SIGN_IN_ENABLED: true,
}));

// Create account on, as it comes back once a mail sender works in Supabase
// (D69 (c)): the switch, the sign-up path and step 190's checklist are kept
// for then, and these keep them working. Hidden, as shipped since
// 2026-11-19, is SignInView.signUpOff.test.tsx's.
jest.mock('./emailSignUp', () => ({ EMAIL_SIGN_UP_ENABLED: true }));

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
      // With Create account offered, nothing sends someone new elsewhere.
      expect(screen.queryByTestId('account-new-here')).toBeNull();
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

    // Step 195: the raised segment's outline meets the sunken track, where
    // controlBorder is 2.93:1 in light; textTertiary is 4.66:1 there.
    it('outlines the chosen segment in textTertiary, and only that one', () => {
      render(<SignInView onDone={jest.fn()} />);
      const border = (id: string) =>
        StyleSheet.flatten(screen.getByTestId(id).props.style).borderColor;
      expect(border('account-mode-signIn')).toBe(colors.textTertiary);
      expect(border('account-mode-signUp')).toBe('transparent');
      fireEvent.press(screen.getByTestId('account-mode-signUp'));
      expect(border('account-mode-signUp')).toBe(colors.textTertiary);
      expect(border('account-mode-signIn')).toBe('transparent');
    });
  });

  // Step 190 (owner): Create account asks for more than 8 characters. The
  // rules are listed under the field from the start and tick off as typed.
  describe("Create account's password checklist", () => {
    // Each row as shown, then as VoiceOver says it. The ranges since the
    // security review, 2026-11-18: only A–Z, a–z and 0–9 count, as on the
    // server, and "Éxample1" left the uppercase row unmet with no reason.
    const RULES = [
      ['length', '8 or more characters', '8 or more characters'],
      ['upper', 'An uppercase letter (A–Z)', 'An uppercase letter, A to Z'],
      ['lower', 'A lowercase letter (a–z)', 'A lowercase letter, a to z'],
      ['digit', 'A number (0–9)', 'A number, 0 to 9'],
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
      return RULES.filter(([key, , said]) => {
        const spoken = row(key).props.accessibilityLabel;
        if (spoken === `${said}, met`) return true;
        expect(spoken).toBe(`${said}, not met`);
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
      for (const [key, , said] of RULES) {
        expect(row(key).props.accessibilityLabel).toBe(`${said}, not met`);
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
      for (const [key, , said] of RULES) {
        expect(screen.getByLabelText(`${said}, met`)).toBe(row(key));
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

    it('says which letters count, so "Éxample1" shows why the uppercase rule is unmet', () => {
      render(<SignInView onDone={jest.fn()} />);
      fireEvent.press(screen.getByTestId('account-mode-signUp'));
      fireEvent.changeText(screen.getByTestId('account-password'), 'Éxample1');

      expect(metKeys()).toEqual(['length', 'lower', 'digit']);
      expect(row('upper')).toHaveTextContent('An uppercase letter (A–Z)');
      expect(row('upper').props.accessibilityLabel).toBe('An uppercase letter, A to Z, not met');
      expect(row('lower')).toHaveTextContent('A lowercase letter (a–z)');
      expect(row('digit')).toHaveTextContent('A number (0–9)');
      // The length rule names no range.
      expect(row('length')).toHaveTextContent('8 or more characters');
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

  // Security review, 2026-11-18: accessibilityRole="alert" posts nothing on
  // iOS, so a refusal was never spoken. Each one is announced as it shows.
  describe('errors said aloud', () => {
    let announce: jest.SpyInstance;
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { AccessibilityInfo } = require('react-native') as typeof import('react-native');
      announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    });
    afterEach(() => announce.mockRestore());

    it('announces a refused sign-in, word for word, once', async () => {
      signInWithEmail.mockResolvedValue({ ok: false, error: 'Invalid login credentials' });
      render(<SignInView onDone={jest.fn()} />);

      fill('a@b.co', 'wrong');
      fireEvent.press(screen.getByTestId('account-submit'));

      expect(await screen.findByTestId('account-error')).toHaveTextContent(
        'Invalid login credentials',
      );
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith('Invalid login credentials');
    });

    it('announces a refused sign-up', async () => {
      signUpWithEmail.mockResolvedValue({
        ok: false,
        error: 'Your password needs an uppercase letter.',
      });
      render(<SignInView onDone={jest.fn()} />);

      fireEvent.press(screen.getByTestId('account-mode-signUp'));
      fill('a@b.co', 'hunter22');
      fireEvent.press(screen.getByTestId('account-submit'));

      expect(await screen.findByTestId('account-error')).toHaveTextContent(
        'Your password needs an uppercase letter.',
      );
      expect(announce).toHaveBeenCalledWith('Your password needs an uppercase letter.');
    });

    it('announces a failed Sign in with Apple', async () => {
      const original = Platform.OS;
      Platform.OS = 'ios';
      try {
        signInWithApple.mockResolvedValue({ ok: false, error: 'Apple sign-in failed.' });
        render(<SignInView onDone={jest.fn()} />);

        fireEvent.press(screen.getByTestId('account-apple'));

        expect(await screen.findByTestId('account-error')).toHaveTextContent(
          'Apple sign-in failed.',
        );
        expect(announce).toHaveBeenCalledWith('Apple sign-in failed.');
      } finally {
        Platform.OS = original;
      }
    });

    it('announces nothing when signing in works', async () => {
      signInWithEmail.mockResolvedValue({ ok: true });
      const onDone = jest.fn();
      render(<SignInView onDone={onDone} />);

      fill('a@b.co', 'hunter22');
      fireEvent.press(screen.getByTestId('account-submit'));

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(announce).not.toHaveBeenCalled();
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
  const { __setPersistenceForTests, useSettingsStore } = require('@/store/settingsStore') as typeof import('@/store/settingsStore');
  const { PRIVACY_POLICY_URL } = require('@/constants/app') as typeof import('@/constants/app');
  /* eslint-enable @typescript-eslint/no-var-requires */
  // In act: the switch on screen follows the store, and the screen is still up here.
  afterEach(() => act(() => useSettingsStore.setState({ analyticsEnabled: true })));

  it('says usage counts go with the account, and how to turn them off', () => {
    render(<SignInView onDone={jest.fn()} />);
    expect(screen.getByTestId('account-usage-note')).toHaveTextContent(
      'Once you’re signed in, a record of which features you use, including what’s already on this phone, is sent with your account, to see how the app is used: numbers, yes/no values and fixed labels such as which screen, never the words of your predictions or notes. You can turn this off here or in You, under Usage stats.',
    );
  });

  // Review 2026-11-19 (UK and Apple rules): the purpose is said where the
  // choice is made, in the Warm-up line's own words for it, so the two agree.
  it('says what the counts are for, in the Warm-up line’s words', () => {
    const purpose = 'to see how the app is used';
    expect(WARMUP_USAGE_NOTE).toContain(purpose);
    expect(USAGE_NOTE).toContain(`is sent with your account, ${purpose}: numbers`);
    render(<SignInView onDone={jest.fn()} />);
    expect(screen.getByTestId('account-usage-note')).toHaveTextContent(new RegExp(purpose));
  });

  // Policy audit F7 (2026-11-18): the paywall's and the share events carry a
  // fixed label (which screen, which card; src/analytics/events.ts), so
  // "numbers and yes/no values" alone wasn't true.
  it('names the fixed labels the counts carry, and no words of your own', () => {
    render(<SignInView onDone={jest.fn()} />);
    const note = screen.getByTestId('account-usage-note');
    expect(note).toHaveTextContent(/fixed labels such as which screen/);
    expect(note).toHaveTextContent(/never the words of your predictions or notes/);
    expect(note).not.toHaveTextContent(/numbers and yes\/no values,/);
  });

  // Decision 9 (2026-11-19): the state and a switch, always, as on the
  // Warm-up's first screen.
  it('says they are off, and how to turn them on, once they are off', () => {
    useSettingsStore.setState({ analyticsEnabled: false });
    render(<SignInView onDone={jest.fn()} />);
    expect(screen.getByTestId('account-usage-note')).toHaveTextContent(
      'Usage stats are off, so no record of which features you use is sent. You can turn them on here or in You, under Usage stats.',
    );
    expect(screen.getByTestId('account-usage-row').props.accessibilityState).toMatchObject({
      checked: false,
    });
  });

  it('is one switch named Usage stats, with the line shown as its hint, in both states', () => {
    render(<SignInView onDone={jest.fn()} />);
    const row = screen.getByTestId('account-usage-row');
    expect(row.props.accessibilityRole).toBe('switch');
    expect(row.props.accessibilityLabel).toBe('Usage stats');
    expect(row.props.accessibilityHint).toBe(USAGE_NOTE);
    expect(row.props.accessibilityState).toMatchObject({ checked: true });
    // The inner switch is hidden from assistive tech.
    expect(screen.queryByTestId('account-usage-switch')).toBeNull();
    expect(screen.getByTestId('account-usage-switch', { includeHiddenElements: true })).toBeTruthy();

    act(() => useSettingsStore.setState({ analyticsEnabled: false }));
    expect(screen.getByTestId('account-usage-row').props.accessibilityHint).toBe(USAGE_OFF_NOTE);
  });

  it('turns usage stats off and on in the same setting as You', async () => {
    __setPersistenceForTests({ load: async () => null, save: async () => {} });
    // Off deletes what's queued, from the database (the settings store's
    // setAnalyticsEnabled, which the switch calls).
    setDbForTests(await createTestDb());
    try {
      const queued = (id: string) =>
        enqueueEvent({
          id,
          user_id: 'local-user-v1',
          name: 'warmup_started',
          props: {},
          created_at: '2026-11-19T12:00:00.000Z',
        });
      await expect(queued('e1')).resolves.toBe(true);
      await expect(queued('e2')).resolves.toBe(true);
      expect(await countUnsyncedEvents()).toBe(2);

      render(<SignInView onDone={jest.fn()} />);
      fireEvent.press(screen.getByTestId('account-usage-row'));
      await waitFor(() => expect(useSettingsStore.getState().analyticsEnabled).toBe(false));
      expect(screen.getByTestId('account-usage-note')).toHaveTextContent(USAGE_OFF_NOTE);
      // The queue went with the switch, not just what comes later.
      await waitFor(async () => expect(await countUnsyncedEvents()).toBe(0));

      // On again brings nothing back, and clears nothing new.
      await expect(queued('e3')).resolves.toBe(true);
      fireEvent.press(screen.getByTestId('account-usage-row'));
      await waitFor(() => expect(useSettingsStore.getState().analyticsEnabled).toBe(true));
      expect(screen.getByTestId('account-usage-note')).toHaveTextContent(USAGE_NOTE);
      await act(async () => {});
      expect(await countUnsyncedEvents()).toBe(1);
    } finally {
      __setPersistenceForTests(null);
      setDbForTests(null);
    }
  });

  // The record couldn't be read: the store holds usage stats off, and so does the switch.
  it('shows the switch off while the settings store holds its fail-safe state', () => {
    useSettingsStore.setState({ loadFailed: true, analyticsEnabled: false });
    try {
      render(<SignInView onDone={jest.fn()} />);
      const inner = screen.getByTestId('account-usage-switch', { includeHiddenElements: true });
      expect(inner.props.value).toBe(false);
      expect(screen.getByTestId('account-usage-note')).toHaveTextContent(USAGE_OFF_NOTE);
    } finally {
      useSettingsStore.setState({ loadFailed: false });
    }
  });

  // The buttons under it stay put: the longer line, the one for on, holds the
  // space in both states, unseen and unheard while the other is shown.
  it('keeps the longer line’s space while off, so the buttons below don’t move', () => {
    useSettingsStore.setState({ analyticsEnabled: false });
    render(<SignInView onDone={jest.fn()} />);
    expect(screen.queryByTestId('account-usage-spacer')).toBeNull();
    const spacer = screen.getByTestId('account-usage-spacer', { includeHiddenElements: true });
    expect(spacer).toHaveTextContent(USAGE_NOTE);
    expect(StyleSheet.flatten(spacer.props.style)).toMatchObject({ opacity: 0 });
    // The off line sits over that space, not after it.
    expect(StyleSheet.flatten(screen.getByTestId('account-usage-note').props.style)).toMatchObject({
      position: 'absolute',
      top: 0,
    });

    // On, the same line is in the same place, now shown, and nothing sits over it.
    act(() => useSettingsStore.setState({ analyticsEnabled: true }));
    expect(screen.queryByTestId('account-usage-spacer', { includeHiddenElements: true })).toBeNull();
    const note = screen.getByTestId('account-usage-note');
    expect(note).toHaveTextContent(USAGE_NOTE);
    expect(StyleSheet.flatten(note.props.style).opacity).toBeUndefined();
    expect(StyleSheet.flatten(note.props.style).position).toBeUndefined();
  });

  it('opens the privacy policy', () => {
    const { openBrowserAsync } = jest.requireMock('expo-web-browser');
    render(<SignInView onDone={jest.fn()} />);
    fireEvent.press(screen.getByTestId('account-privacy-link'));
    expect(openBrowserAsync).toHaveBeenLastCalledWith(PRIVACY_POLICY_URL);
  });
});

// The owner's decision, 2026-11-19: on a phone whose region is Canada, Usage
// stats start off until the person turns them on. The off line was already
// there; it reads true for someone who never chose ("are off", not "you
// turned them off").
describe('SignInView — usage stats on a phone in Canada', () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { __setPersistenceForTests, useSettingsStore } = require('@/store/settingsStore') as typeof import('@/store/settingsStore');
  const { __setDeviceLocaleForTests } = require('@/constants/locale') as typeof import('@/constants/locale');
  /* eslint-enable @typescript-eslint/no-var-requires */

  beforeEach(() => {
    __setPersistenceForTests({ load: async () => null, save: async () => {} });
    act(() => useSettingsStore.setState({ analyticsEnabled: true, analyticsChosen: false }));
  });
  afterEach(() => {
    __setDeviceLocaleForTests(null);
    act(() => __setPersistenceForTests(null));
  });

  it('shows the switch off, with the off line, before any choice', () => {
    __setDeviceLocaleForTests('en-CA');
    render(<SignInView onDone={jest.fn()} />);
    const row = screen.getByTestId('account-usage-row');
    expect(row.props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByTestId('account-usage-switch', { includeHiddenElements: true }).props.value).toBe(false);
    expect(screen.getByTestId('account-usage-note')).toHaveTextContent(USAGE_OFF_NOTE);
    expect(USAGE_OFF_NOTE).toBe(
      'Usage stats are off, so no record of which features you use is sent. You can turn them on here or in You, under Usage stats.',
    );
    expect(USAGE_OFF_NOTE).not.toMatch(/you turned/i);
  });

  it('turns them on there: the choice is stored and the line says they go with the account', async () => {
    __setDeviceLocaleForTests('en-CA');
    render(<SignInView onDone={jest.fn()} />);
    const row = screen.getByTestId('account-usage-row');
    await waitFor(() => expect(row).toBeEnabled());
    fireEvent.press(row);
    await waitFor(() => expect(useSettingsStore.getState().analyticsChosen).toBe(true));
    expect(useSettingsStore.getState().analyticsEnabled).toBe(true);
    expect(screen.getByTestId('account-usage-row').props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByTestId('account-usage-note')).toHaveTextContent(USAGE_NOTE);
  });

  it('elsewhere, shows them on before any choice, as before', () => {
    __setDeviceLocaleForTests('en-US');
    render(<SignInView onDone={jest.fn()} />);
    expect(screen.getByTestId('account-usage-row').props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByTestId('account-usage-note')).toHaveTextContent(USAGE_NOTE);
  });
});
