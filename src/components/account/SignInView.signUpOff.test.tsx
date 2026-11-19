import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { colors, type } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

import { newHereLine, SignInView } from './SignInView';

// Create account hidden until a custom mail sender works in Supabase (owner
// decision 2026-11-19, D69 (c)), as shipped: stated here so these hold
// whatever emailSignUp.ts says. Create account on is SignInView.test.tsx's.
jest.mock('./emailSignUp', () => ({ EMAIL_SIGN_UP_ENABLED: false }));

// "Continue with Google" on, as shipped since 2026-11-18.
jest.mock('@/constants/app', () => ({
  ...jest.requireActual('@/constants/app'),
  GOOGLE_SIGN_IN_ENABLED: true,
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));

// Apple's real button loads a native module; its place is all these need.
jest.mock('./AppleSignInButton', () => {
  const { Platform: P, Pressable } = jest.requireActual('react-native');
  return {
    AppleSignInButton: ({ onPress }: { onPress: () => void }) =>
      P.OS === 'ios' ? <Pressable testID="account-apple" onPress={onPress} /> : null,
  };
});

const NEW_HERE = 'New here? Use Apple or Google for now.';

const signInWithEmail = jest.fn();
const signUpWithEmail = jest.fn();
const signInWithApple = jest.fn();
const signInWithGoogle = jest.fn();

const originalOS = Platform.OS;
function setOS(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  setOS('ios');
  useAuthStore.setState({
    pending: false,
    signInWithEmail,
    signUpWithEmail,
    signInWithApple,
    signInWithGoogle,
  });
});

afterAll(() => setOS(originalOS));

/** What `screen.toJSON()` holds: host elements and their text. */
type JsonNode = { props?: { testID?: unknown }; children?: (JsonNode | string)[] | null };

/** Every testID on screen, in the order a reader (and VoiceOver) meets them. */
function testIdsInOrder(): string[] {
  const ids: string[] = [];
  const walk = (node: JsonNode | JsonNode[] | string | null) => {
    if (node === null || typeof node === 'string') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const id = node.props?.testID;
    if (typeof id === 'string') ids.push(id);
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON() as unknown as JsonNode | JsonNode[] | null);
  return ids;
}

describe('SignInView — Create account hidden (D69 (c))', () => {
  it('offers no switch and no Create account anywhere: it is a sign-in screen', () => {
    render(<SignInView onDone={jest.fn()} />);

    expect(screen.queryByTestId('account-mode-signIn')).toBeNull();
    expect(screen.queryByTestId('account-mode-signUp')).toBeNull();
    expect(screen.queryByLabelText('Account')).toBeNull();
    expect(screen.queryByText(/Create (an )?account/)).toBeNull();
    expect(screen.getByRole('header')).toHaveTextContent('Sign in');
    expect(screen.getByTestId('account-submit')).toHaveTextContent('Sign in');
    expect(screen.getByTestId('account-password').props.autoComplete).toBe('current-password');
  });

  it('says where someone new goes, under the email form, in the secondary style', () => {
    render(<SignInView onDone={jest.fn()} />);

    const line = screen.getByTestId('account-new-here');
    expect(line).toHaveTextContent(NEW_HERE);
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({
      fontSize: type.subhead.fontSize,
      color: colors.textSecondary,
    });
  });

  // VoiceOver's order: the two buttons, the form, its button, then the line
  // that points back up to the buttons.
  it('keeps a sensible reading order', () => {
    render(<SignInView onDone={jest.fn()} />);
    const ids = testIdsInOrder();
    const at = (id: string) => {
      const i = ids.indexOf(id);
      expect(i).toBeGreaterThanOrEqual(0);
      return i;
    };

    expect(at('account-apple')).toBeLessThan(at('account-google'));
    expect(at('account-google')).toBeLessThan(at('account-email'));
    expect(at('account-email')).toBeLessThan(at('account-password'));
    expect(at('account-password')).toBeLessThan(at('account-submit'));
    expect(at('account-submit')).toBeLessThan(at('account-new-here'));
    expect(ids[ids.length - 1]).toBe('account-new-here');
  });

  it('still signs in by email, and never signs up', async () => {
    signInWithEmail.mockResolvedValue({ ok: true });
    const onDone = jest.fn();
    render(<SignInView onDone={onDone} />);

    fireEvent.changeText(screen.getByTestId('account-email'), 'a@b.co');
    fireEvent.changeText(screen.getByTestId('account-password'), 'hunter22');
    await waitFor(() => expect(screen.getByTestId('account-submit')).toBeEnabled());
    fireEvent.press(screen.getByTestId('account-submit'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(signInWithEmail).toHaveBeenCalledWith('a@b.co', 'hunter22');
    expect(signUpWithEmail).not.toHaveBeenCalled();
  });

  it('shows no password checklist as a password is typed', () => {
    render(<SignInView onDone={jest.fn()} />);
    fireEvent.changeText(screen.getByTestId('account-password'), 'x');
    expect(screen.queryByTestId('account-password-hint')).toBeNull();
    expect(screen.queryByTestId('account-password-rule-length')).toBeNull();
  });

  it('still offers Apple and Google, which make an account for someone new', async () => {
    signInWithGoogle.mockResolvedValue({ ok: true });
    signInWithApple.mockResolvedValue({ ok: true });
    const onDone = jest.fn();
    render(<SignInView onDone={onDone} />);

    fireEvent.press(screen.getByTestId('account-google'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('account-apple'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(2));
  });

  // Apple's and Google's buttons are iOS only: elsewhere (the web build) there
  // is nothing to point to, so no line points to it.
  it.each(['web', 'android'] as const)('says nothing about Apple or Google on %s', (os) => {
    setOS(os);
    render(<SignInView onDone={jest.fn()} />);
    expect(screen.queryByTestId('account-apple')).toBeNull();
    expect(screen.queryByTestId('account-google')).toBeNull();
    expect(screen.queryByTestId('account-new-here')).toBeNull();
    expect(screen.queryByTestId('account-mode-signUp')).toBeNull();
  });
});

describe('newHereLine', () => {
  it('names only the buttons the screen shows', () => {
    expect(newHereLine(true, true)).toBe(NEW_HERE);
    expect(newHereLine(true, false)).toBe('New here? Use Apple for now.');
    expect(newHereLine(false, true)).toBe('New here? Use Google for now.');
    expect(newHereLine(false, false)).toBeNull();
  });
});
