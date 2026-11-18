import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useAuthStore } from '@/store/authStore';

import { GOOGLE_BUTTON_LABEL } from './GoogleSignInButton';
import { SignInView } from './SignInView';

// Step 192, with the flag off: what turning it off does to the sign-in
// screen, stated here so it holds whatever src/constants/app.ts says (on
// since 2026-11-18). The flag on is SignInView.google.test.tsx's.
jest.mock('@/constants/app', () => ({
  ...jest.requireActual('@/constants/app'),
  GOOGLE_SIGN_IN_ENABLED: false,
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

const signInWithEmail = jest.fn();
const signInWithApple = jest.fn();
const signInWithGoogle = jest.fn();

const originalOS = Platform.OS;
function setOS(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  // iOS, where the button would otherwise show, so only the flag hides it.
  setOS('ios');
  useAuthStore.setState({ pending: false, signInWithEmail, signInWithApple, signInWithGoogle });
});

afterAll(() => setOS(originalOS));

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

describe('SignInView — Continue with Google, flag off', () => {
  it("shows no Google button: Apple's sits above the Sign in / Create account switch", () => {
    render(<SignInView onDone={jest.fn()} />);
    const ids = testIdsInOrder();

    expect(ids.filter((id) => id.startsWith('account-google'))).toEqual([]);
    expect(screen.queryByText(GOOGLE_BUTTON_LABEL)).toBeNull();
    expect(screen.queryByLabelText(GOOGLE_BUTTON_LABEL)).toBeNull();

    const apple = ids.indexOf('account-apple');
    const modes = ids.indexOf('account-mode-signIn');
    expect(apple).toBeGreaterThanOrEqual(0);
    expect(modes).toBeGreaterThan(apple);
  });

  it('never reaches Google: Apple and email sign in as before', async () => {
    signInWithApple.mockResolvedValue({ ok: true });
    signInWithEmail.mockResolvedValue({ ok: true });
    const onDone = jest.fn();
    render(<SignInView onDone={onDone} />);

    fireEvent.press(screen.getByTestId('account-apple'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));

    fireEvent.changeText(screen.getByTestId('account-email'), 'a@b.co');
    fireEvent.changeText(screen.getByTestId('account-password'), 'hunter22');
    await waitFor(() => expect(screen.getByTestId('account-submit')).toBeEnabled());
    fireEvent.press(screen.getByTestId('account-submit'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(2));

    expect(signInWithApple).toHaveBeenCalledTimes(1);
    expect(signInWithEmail).toHaveBeenCalledWith('a@b.co', 'hunter22');
    expect(signInWithGoogle).not.toHaveBeenCalled();
  });
});
