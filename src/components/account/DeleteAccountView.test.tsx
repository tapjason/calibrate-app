import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking, Platform, StyleSheet } from 'react-native';

import { PLUS_NAME } from '@/constants/app';
import { colors, type } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { __resetLockStoreForTests, useLockStore } from '@/store/lockStore';
import { DELETE_FAILED_MESSAGE, DELETE_UNCONFIRMED_MESSAGE } from '@/supabase/account';
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
  apple = false,
  google = false,
  entitlement = FREE_ENTITLEMENT,
}: { signedIn?: boolean; apple?: boolean; google?: boolean; entitlement?: Entitlement } = {}) {
  useAuthStore.setState({
    userId: signedIn ? 'user-1' : 'local-user-v1',
    status: signedIn ? 'authenticated' : 'guest',
    hasAppleIdentity: signedIn && apple,
    hasGoogleIdentity: signedIn && google,
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
      useAuthStore.setState({ status: 'guest', userId: 'local-user-v1', hasAppleIdentity: false });
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

  // An email account linked to Apple has the flag too (hasAppleIdentity in
  // src/supabase/auth.ts); deletion asks Apple for both, so the note shows.
  it('tells an account with an Apple identity it will be asked to confirm with Apple', () => {
    seed({ apple: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('delete-apple-note')).toBeTruthy();
  });

  it('gives an email-only account no Apple note', () => {
    seed();
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByTestId('delete-apple-note')).toBeNull();
  });

  // Step 192: the app holds no Google token, so nothing is revoked from here;
  // an account with a Google identity is told where to look instead.
  it('tells an account with a Google identity where to remove the app from Google', () => {
    seed({ google: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByTestId('delete-google-note')).toHaveTextContent(
      'Deleting your account removes what Google shared with us. To remove Fairly Sure from your Google Account too, open its security settings and look under third-party connections.',
    );
    expect(screen.queryByTestId('delete-apple-note')).toBeNull();
  });

  it('shows the Google note only to an account with a Google identity', () => {
    seed();
    const { unmount } = render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByTestId('delete-google-note')).toBeNull();
    unmount();

    seed({ apple: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('delete-apple-note')).toBeTruthy();
    expect(screen.queryByTestId('delete-google-note')).toBeNull();
  });

  it('gives an account linked to both Apple and Google both notes, before the button', () => {
    seed({ apple: true, google: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByTestId('delete-apple-note')).toBeTruthy();
    expect(screen.getByTestId('delete-google-note')).toBeTruthy();
    // Said before deletion: the confirm step, not the finished screen.
    expect(screen.getByTestId('delete-confirm')).toBeTruthy();
    expect(screen.getByTestId('delete-confirm-button')).toBeTruthy();
  });

  // Deletion itself is unchanged: no Google sheet, the same one alert.
  it('deletes a Google account through the same alert, and says it is done', async () => {
    seed({ google: true });
    deleteAccount.mockResolvedValue({ ok: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    expect(lastAlert().message).toBe(SIGNED_IN_MESSAGE);
    chooseInAlert('Delete account');

    expect(await screen.findByText('Your account has been deleted')).toBeTruthy();
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('delete-google-note')).toBeNull();
  });

  it('gives a guest no Google note', () => {
    seed({ signedIn: false, google: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByTestId('delete-google-note')).toBeNull();
  });

  // Security review, 2026-11-18: the Warmup's and practice's answers never
  // leave the phone (only tallies go up as usage counts), so they are removed
  // from this phone, never "from our servers".
  it('says what goes from the servers and what only from this phone', () => {
    seed();
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    const body = screen.getByText(/permanently deletes/);
    expect(body).toHaveTextContent(
      "This permanently deletes your account, every prediction and reflection and your calibration history, from our servers and from this phone, and your Warmup and practice answers from this phone. It happens immediately and can't be undone.",
    );
    expect(body).not.toHaveTextContent(/practice answers, from our servers/);
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

// Security review, 2026-11-18: the system alert has its own window, above the
// app lock. Left up when the person went Home, it is still there when someone
// else opens the app and cancels Face ID, and its button must do nothing.
describe('DeleteAccountView — the alert pressed while the app is locked', () => {
  afterEach(() => __resetLockStoreForTests());

  it.each([
    ['signed in', true, 'Delete account'],
    ['guest', false, 'Erase'],
  ])('deletes and erases nothing (%s)', async (_label, signedIn, button) => {
    seed({ signedIn });
    deleteAccount.mockResolvedValue({ ok: true });
    eraseDeviceData.mockResolvedValue({ ok: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    // The app went to the background with the alert up, and locked.
    act(() => useLockStore.setState({ locked: true }));
    chooseInAlert(button);
    await act(async () => {
      await Promise.resolve();
    });

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(eraseDeviceData).not.toHaveBeenCalled();
    expect(screen.getByTestId('delete-confirm')).toBeTruthy();
    expect(screen.queryByTestId('delete-finished')).toBeNull();
    expect(screen.queryByTestId('delete-error')).toBeNull();
    expect(screen.getByTestId('delete-confirm-button')).not.toBeDisabled();
  });

  it('works as before once the lock is open again', async () => {
    seed();
    deleteAccount.mockResolvedValue({ ok: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    act(() => useLockStore.setState({ locked: true }));
    act(() => useLockStore.setState({ locked: false }));
    chooseInAlert('Delete account');

    expect(await screen.findByText('Your account has been deleted')).toBeTruthy();
    expect(deleteAccount).toHaveBeenCalledTimes(1);
  });
});

// Deletion can wait 45 seconds on the server, then check once more whether the
// account is gone (security review, 2026-11-18).
describe('DeleteAccountView — while deletion runs', () => {
  it('says it can take up to a minute, under the disabled button', () => {
    seed();
    useAuthStore.setState({ pending: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByTestId('delete-confirm-button')).toBeDisabled();
    expect(screen.getByTestId('delete-confirm-button')).toHaveTextContent('Deleting…');
    const note = screen.getByTestId('delete-pending-note');
    expect(note).toHaveTextContent('This can take up to a minute.');
    expect(StyleSheet.flatten(note.props.style)).toMatchObject({
      fontSize: type.subhead.fontSize,
      color: colors.textSecondary,
    });
  });

  it('shows the line only while it runs, and to nobody erasing this phone', async () => {
    seed();
    let finish!: (outcome: { ok: false; error: string }) => void;
    deleteAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          useAuthStore.setState({ pending: true });
          finish = (outcome) => {
            useAuthStore.setState({ pending: false });
            resolve(outcome);
          };
        }),
    );
    const view = render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByTestId('delete-pending-note')).toBeNull();

    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    chooseInAlert('Delete account');
    expect(await screen.findByTestId('delete-pending-note')).toBeTruthy();

    await act(async () => {
      finish({ ok: false, error: DELETE_FAILED_MESSAGE });
    });
    expect(screen.queryByTestId('delete-pending-note')).toBeNull();
    view.unmount();

    seed({ signedIn: false });
    useAuthStore.setState({ pending: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('delete-confirm-button')).toHaveTextContent('Erasing…');
    expect(screen.queryByTestId('delete-pending-note')).toBeNull();
  });

  // Both failures come from src/supabase/account.ts; the screen shows the
  // outcome's own words and stays on the confirm step, button enabled.
  it.each([
    ['nothing was deleted', DELETE_FAILED_MESSAGE],
    ['no answer either way', DELETE_UNCONFIRMED_MESSAGE],
  ])('shows the failure when %s', async (_label, message) => {
    seed();
    deleteAccount.mockResolvedValue({ ok: false, error: message });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    chooseInAlert('Delete account');

    expect(await screen.findByTestId('delete-error')).toHaveTextContent(message);
    expect(screen.getByTestId('delete-confirm')).toBeTruthy();
    expect(screen.queryByTestId('delete-finished')).toBeNull();
    expect(screen.getByTestId('delete-confirm-button')).not.toBeDisabled();
  });
});

// Security review, 2026-11-18, round 4 (ACCOUNT_SPEC §3.2 step 5): when the
// Apple grant may still stand (the sheet was cancelled, the server skipped or
// failed the revoke, or its answer was never seen), the finished screen says
// where to remove the app, in Apple's own path (support.apple.com/en-us/102571).
describe('DeleteAccountView — Sign in with Apple not revoked', () => {
  const REMOVE_NOTE =
    'Sign in with Apple may still list Fairly Sure. To remove it, open Settings, tap your name, then Sign in with Apple.';

  async function deleteWith(
    outcome: { ok: true; appleNotRevoked: boolean },
    options: { apple?: boolean; google?: boolean } = {},
  ) {
    seed(options);
    deleteAccount.mockResolvedValue(outcome);
    const view = render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('delete-confirm-button')).not.toBeDisabled());
    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    chooseInAlert('Delete account');
    expect(await screen.findByTestId('delete-finished')).toBeTruthy();
    return view;
  }

  it('says where to remove the app when the grant was not revoked, in the secondary style', async () => {
    await deleteWith({ ok: true, appleNotRevoked: true }, { apple: true });

    const note = screen.getByTestId('delete-apple-remove-note');
    expect(note).toHaveTextContent(REMOVE_NOTE);
    expect(StyleSheet.flatten(note.props.style)).toMatchObject({
      fontSize: type.subhead.fontSize,
      color: colors.textSecondary,
    });
    // Under the confirmation, beside the Done button.
    expect(screen.getByText('Your account has been deleted')).toBeTruthy();
    expect(screen.getByTestId('delete-done')).toBeTruthy();
  });

  it('says nothing about Apple when the grant was revoked', async () => {
    await deleteWith({ ok: true, appleNotRevoked: false }, { apple: true });
    expect(screen.queryByTestId('delete-apple-remove-note')).toBeNull();
    expect(screen.queryByText(/Sign in with Apple may still list/)).toBeNull();
  });

  it('says nothing about Apple to an account that never had it', async () => {
    const emailOnly = await deleteWith({ ok: true, appleNotRevoked: false });
    expect(screen.queryByTestId('delete-apple-remove-note')).toBeNull();

    // A Google account gets no Apple line either.
    emailOnly.unmount();
    await deleteWith({ ok: true, appleNotRevoked: false }, { google: true });
    expect(screen.queryByTestId('delete-apple-remove-note')).toBeNull();
  });

  // The hosting provider's logs and any backups keep some of it for up to 7
  // days (privacy policy §7), so the screen says "deleted", not "gone".
  it('says the account is deleted from the servers, not gone from them', async () => {
    await deleteWith({ ok: true, appleNotRevoked: false });
    expect(
      screen.getByText('Your predictions and account are deleted from our servers and this phone.'),
    ).toBeTruthy();
    expect(screen.queryByText(/gone from our servers/)).toBeNull();
  });

  it('never shows it after a guest erases this phone', async () => {
    seed({ signedIn: false });
    eraseDeviceData.mockResolvedValue({ ok: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('delete-confirm-button')).not.toBeDisabled());
    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    chooseInAlert('Erase');

    expect(await screen.findByText('Your data has been erased')).toBeTruthy();
    expect(screen.queryByTestId('delete-apple-remove-note')).toBeNull();
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
