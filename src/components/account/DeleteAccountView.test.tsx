import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking, Platform } from 'react-native';

import { PLUS_NAME } from '@/constants/app';
import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { FREE_ENTITLEMENT, type Entitlement } from '@/types';

import { DeleteAccountView } from './DeleteAccountView';

const deleteAccount = jest.fn();
const eraseDeviceData = jest.fn();

const SIGNED_IN_MESSAGE =
  "Your account, predictions and record go from our servers and this phone. This can't be undone.";
const BILLING_SENTENCE = `${PLUS_NAME} keeps billing until you cancel it with Apple.`;
const GUEST_MESSAGE = "There's no other copy. This can't be undone.";

function seed({
  signedIn = true,
  provider = 'email',
  entitlement = FREE_ENTITLEMENT,
}: { signedIn?: boolean; provider?: string | null; entitlement?: Entitlement } = {}) {
  useAuthStore.setState({
    userId: signedIn ? 'user-1' : 'local-user-v1',
    status: signedIn ? 'authenticated' : 'guest',
    provider: signedIn ? provider : null,
    pending: false,
    deleteAccount,
    eraseDeviceData,
  });
  useEntitlementStore.setState({
    entitlement,
    isPlus: entitlement.is_plus,
    hydrated: true,
  });
}

let alertSpy: jest.SpyInstance<void, Parameters<typeof Alert.alert>>;

/** The system alert's title, message and buttons, from its last showing. */
function lastAlert() {
  const calls = alertSpy.mock.calls;
  if (calls.length === 0) throw new Error('No alert was shown');
  const [title, message, buttons] = calls[calls.length - 1];
  return { title, message, buttons: buttons ?? [] };
}

/** Taps the alert's button with this label, as the person would. */
function chooseInAlert(label: string) {
  const button = lastAlert().buttons.find((b) => b.text === label);
  if (!button) throw new Error(`The alert has no "${label}" button`);
  act(() => {
    button.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // jest-expo runs these tests as iOS: the system alert, not the web confirm.
  expect(Platform.OS).toBe('ios');
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('DeleteAccountView — signed in', () => {
  // Owner, 2026-11-17: one more question before anything is deleted.
  it('asks with a system alert first, and deletes nothing yet', () => {
    seed();
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const { title, message, buttons } = lastAlert();
    expect(title).toBe('Delete your account for good?');
    expect(message).toBe(SIGNED_IN_MESSAGE);
    expect(buttons.map(({ text, style }) => ({ text, style }))).toEqual([
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive' },
    ]);
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(eraseDeviceData).not.toHaveBeenCalled();
  });

  it('deletes once "Delete account" is chosen, and confirms it happened', async () => {
    seed();
    deleteAccount.mockResolvedValue({ ok: true });
    const onDone = jest.fn();
    render(<DeleteAccountView onDone={onDone} onCancel={jest.fn()} />);

    expect(screen.getByText('Delete your account?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    chooseInAlert('Delete account');

    // Apple: "provide a confirmation when the deletion has been completed".
    expect(await screen.findByText('Your account has been deleted')).toBeTruthy();
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(eraseDeviceData).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('delete-done'));
    expect(onDone).toHaveBeenCalled();
  });

  // Once deleted, status flips to guest; the confirmation must not switch to
  // the guest wording mid-screen.
  it('keeps the account wording after the store has moved to guest', async () => {
    seed();
    deleteAccount.mockImplementation(async () => {
      useAuthStore.setState({ status: 'guest', userId: 'local-user-v1', provider: null });
      return { ok: true };
    });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    chooseInAlert('Delete account');
    expect(await screen.findByText('Your account has been deleted')).toBeTruthy();
  });

  it('shows the failure and stays on the confirm step', async () => {
    seed();
    deleteAccount.mockResolvedValue({ ok: false, error: 'Nothing has been deleted.' });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    chooseInAlert('Delete account');
    expect(await screen.findByTestId('delete-error')).toHaveTextContent(
      'Nothing has been deleted.',
    );
    expect(screen.getByTestId('delete-confirm')).toBeTruthy();
  });

  // Apple: tell subscribers billing continues and ask them to cancel first.
  it.each(['trial', 'monthly', 'annual'] as const)(
    'warns a %s subscriber that billing continues, with a way to cancel',
    (source) => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      seed({ entitlement: { is_plus: true, source, expires_at: null } });
      render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

      expect(screen.getByTestId('delete-subscription-warning')).toBeTruthy();
      fireEvent.press(screen.getByTestId('delete-manage-subscription'));
      expect(openURL).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions');
    },
  );

  it.each(['trial', 'monthly', 'annual'] as const)(
    'says again in the alert that a %s subscription keeps billing',
    (source) => {
      seed({ entitlement: { is_plus: true, source, expires_at: null } });
      render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

      fireEvent.press(screen.getByTestId('delete-confirm-button'));
      expect(lastAlert().message).toBe(`${SIGNED_IN_MESSAGE} ${BILLING_SENTENCE}`);
    },
  );

  it('gives a lifetime owner no billing warning — nothing renews', () => {
    seed({ entitlement: { is_plus: true, source: 'lifetime', expires_at: null } });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByTestId('delete-subscription-warning')).toBeNull();

    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    expect(lastAlert().message).toBe(SIGNED_IN_MESSAGE);
  });

  it('tells an Apple account it will be asked to confirm with Apple', () => {
    seed({ provider: 'apple' });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('delete-apple-note')).toBeTruthy();
  });

  it('disables both buttons while deleting', () => {
    seed();
    useAuthStore.setState({ pending: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('delete-confirm-button')).toBeDisabled();
    expect(screen.getByTestId('delete-cancel')).toBeDisabled();
  });
});

describe('DeleteAccountView — guest', () => {
  it('asks "Erase everything on this phone?" first, and erases on Erase', async () => {
    seed({ signedIn: false });
    eraseDeviceData.mockResolvedValue({ ok: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));

    const { title, message, buttons } = lastAlert();
    expect(title).toBe('Erase everything on this phone?');
    expect(message).toBe(GUEST_MESSAGE);
    expect(buttons.map(({ text, style }) => ({ text, style }))).toEqual([
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive' },
    ]);
    expect(eraseDeviceData).not.toHaveBeenCalled();

    chooseInAlert('Erase');
    await waitFor(() => expect(eraseDeviceData).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Your data has been erased')).toBeTruthy();
  });

  it('erases the device instead, and never calls account deletion', async () => {
    seed({ signedIn: false });
    eraseDeviceData.mockResolvedValue({ ok: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByText('Erase your data on this phone?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    chooseInAlert('Erase');

    await waitFor(() => expect(eraseDeviceData).toHaveBeenCalled());
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(await screen.findByText('Your data has been erased')).toBeTruthy();
  });

  it('names what Erase removes and what stays (playtest 2026-11-13b, run 6)', () => {
    seed({ signedIn: false });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    const body = screen.getByText(/permanently erases/).props.children as string;
    for (const part of ['without an account', 'prediction and reflection', 'categories and their icons', 'practice answers', 'still typing', 'age range', 'usage stats not yet sent', 'Settings, like reminder times, stay']) {
      expect(body).toContain(part);
    }
  });
});

describe('DeleteAccountView — Cancel in the alert', () => {
  it.each([
    ['signed in', true],
    ['guest', false],
  ])('deletes and erases nothing, and stays on the screen (%s)', (_label, signedIn) => {
    seed({ signedIn });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    chooseInAlert('Cancel');

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(eraseDeviceData).not.toHaveBeenCalled();
    expect(screen.getByTestId('delete-confirm')).toBeTruthy();
    expect(screen.queryByTestId('delete-error')).toBeNull();
    expect(screen.getByTestId('delete-confirm-button')).not.toBeDisabled();
  });
});

// react-native-web's Alert.alert does nothing, and the playtest agents use the
// web build, so the browser's own confirm asks there instead.
describe('DeleteAccountView — web', () => {
  const originalOS = Platform.OS;
  let confirm: jest.Mock<boolean, [string?]>;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    confirm = jest.fn();
    Object.defineProperty(window, 'confirm', {
      value: confirm,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    delete (window as { confirm?: unknown }).confirm;
  });

  it("asks with the browser's confirm, and deletes on OK", async () => {
    seed();
    confirm.mockReturnValue(true);
    deleteAccount.mockResolvedValue({ ok: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));

    expect(confirm).toHaveBeenCalledWith(`Delete your account for good?\n\n${SIGNED_IN_MESSAGE}`);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('Your account has been deleted')).toBeTruthy();
    expect(deleteAccount).toHaveBeenCalledTimes(1);
  });

  it('erases a guest on OK', async () => {
    seed({ signedIn: false });
    confirm.mockReturnValue(true);
    eraseDeviceData.mockResolvedValue({ ok: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));

    expect(confirm).toHaveBeenCalledWith(`Erase everything on this phone?\n\n${GUEST_MESSAGE}`);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('Your data has been erased')).toBeTruthy();
  });

  it('does nothing when the confirm is dismissed', () => {
    seed();
    confirm.mockReturnValue(false);
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(eraseDeviceData).not.toHaveBeenCalled();
    expect(screen.getByTestId('delete-confirm')).toBeTruthy();
  });
});
