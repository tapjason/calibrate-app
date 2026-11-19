import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useAuthStore } from '@/store/authStore';

import { SignInView } from './SignInView';

// Step 192, with the flag on, as shipped since 2026-11-18, stated here so
// these hold whatever src/constants/app.ts says. The flag off is covered in
// SignInView.googleOff.test.tsx and GoogleSignInButton.test.tsx.
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

const signInWithApple = jest.fn();
const signInWithGoogle = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ pending: false, signInWithApple, signInWithGoogle });
});

/** What `screen.toJSON()` holds: host elements and their text. */
type JsonNode = { props?: { testID?: unknown }; children?: (JsonNode | string)[] | null };

/** Every testID on screen, in the order a reader meets them. */
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

describe('SignInView — Continue with Google', () => {
  // Above the email form: since D69 (c) hid Create account there is no
  // Sign in / Create account switch between them (it was the anchor here),
  // and with it back the switch sits above the email field too.
  it("sits under Apple's button and above the email form", () => {
    render(<SignInView onDone={jest.fn()} />);
    const ids = testIdsInOrder();

    const apple = ids.indexOf('account-apple');
    const google = ids.indexOf('account-google');
    const form = ids.indexOf('account-email');
    expect(apple).toBeGreaterThanOrEqual(0);
    expect(google).toBeGreaterThan(apple);
    expect(form).toBeGreaterThan(google);
  });

  it('signs in and finishes the way Apple does', async () => {
    signInWithGoogle.mockResolvedValue({ ok: true });
    const onDone = jest.fn();
    render(<SignInView onDone={onDone} />);

    fireEvent.press(screen.getByTestId('account-google'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(signInWithApple).not.toHaveBeenCalled();
    expect(screen.queryByTestId('account-error')).toBeNull();
  });

  it('shows the error in the same place and stays put', async () => {
    signInWithGoogle.mockResolvedValue({
      ok: false,
      error: "Google sign-in isn't available right now.",
    });
    const onDone = jest.fn();
    render(<SignInView onDone={onDone} />);

    fireEvent.press(screen.getByTestId('account-google'));

    expect(await screen.findByTestId('account-error')).toHaveTextContent(
      "Google sign-in isn't available right now.",
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  // Security review, 2026-11-18: said aloud, as the other refusals are.
  it('announces its error to VoiceOver', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    try {
      signInWithGoogle.mockResolvedValue({
        ok: false,
        error: "Google sign-in isn't available right now.",
      });
      render(<SignInView onDone={jest.fn()} />);

      fireEvent.press(screen.getByTestId('account-google'));

      expect(await screen.findByTestId('account-error')).toBeTruthy();
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith("Google sign-in isn't available right now.");
    } finally {
      announce.mockRestore();
    }
  });

  it("clears an earlier error when it's tapped again", async () => {
    signInWithGoogle.mockResolvedValueOnce({ ok: false, error: 'Sign-in cancelled.' });
    signInWithGoogle.mockResolvedValueOnce({ ok: true });
    const onDone = jest.fn();
    render(<SignInView onDone={onDone} />);

    fireEvent.press(screen.getByTestId('account-google'));
    expect(await screen.findByTestId('account-error')).toHaveTextContent('Sign-in cancelled.');

    fireEvent.press(screen.getByTestId('account-google'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('account-error')).toBeNull();
  });

  it('is disabled with Apple and the submit button while a sign-in is in flight', () => {
    useAuthStore.setState({ pending: true });
    render(<SignInView onDone={jest.fn()} />);

    expect(screen.getByTestId('account-google')).toBeDisabled();
    expect(screen.getByTestId('account-submit')).toBeDisabled();
    fireEvent.press(screen.getByTestId('account-google'));
    expect(signInWithGoogle).not.toHaveBeenCalled();
  });
});
