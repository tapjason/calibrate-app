import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useAuthStore } from '@/store/authStore';

import { SignInView } from './SignInView';

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

    fireEvent.press(screen.getByTestId('account-switch-mode'));
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

    fireEvent.press(screen.getByTestId('account-switch-mode'));
    fill('a@b.co', 'hunter22');
    fireEvent.press(screen.getByTestId('account-submit'));

    expect(await screen.findByTestId('account-notice')).toHaveTextContent(/a@b\.co/);
    expect(onDone).not.toHaveBeenCalled();
    // Back in sign-in mode, ready for when they return from the email.
    expect(screen.getByTestId('account-submit')).toHaveTextContent('Sign in');
    expect(screen.getByTestId('account-email').props.value).toBe('a@b.co');
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
