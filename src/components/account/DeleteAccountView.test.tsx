import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking, Platform, StyleSheet } from 'react-native';

import { PLUS_NAME } from '@/constants/app';
import { colors, type } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { __resetLockStoreForTests, useLockStore } from '@/store/lockStore';
import { DELETE_FAILED_MESSAGE, DELETE_UNCONFIRMED_MESSAGE } from '@/supabase/account';
import { FREE_ENTITLEMENT, type Entitlement } from '@/types';

import { DeleteAccountView, ERASE_COUNT_WAIT_MS, eraseConfirmMessage } from './DeleteAccountView';

const deleteAccount = jest.fn();
const eraseDeviceData = jest.fn();
const countUnsyncedAccountChanges = jest.fn<Promise<number | null>, []>();

const SIGNED_IN_MESSAGE =
  "Your account, predictions and record go from our servers and this phone. This can't be undone.";
const BILLING_SENTENCE = `${PLUS_NAME} keeps billing until you cancel it with Apple.`;
// Main session decision 2026-11-19: Erase takes everything on the phone,
// an earlier account's leftovers included, which that account may have
// backed up.
const GUEST_MESSAGE = "Nothing here has another copy unless an account backed it up. This can't be undone.";
// Re-review 2026-11-19: a count that couldn't be read (null, a throw, no
// answer in 3 s) says such changes may exist, as sign-out stops in that case.
const UNREAD_MESSAGE =
  "Nothing here has another copy unless an account backed it up. Changes an account made on this phone may not have reached our server; if so, they will be lost. This can't be undone.";

function seed({
  signedIn = true,
  apple = false,
  google = false,
  entitlement = FREE_ENTITLEMENT,
  unsynced = 0,
}: {
  signedIn?: boolean;
  apple?: boolean;
  google?: boolean;
  entitlement?: Entitlement;
  /** What `countUnsyncedAccountChanges` reads at each tap; null, couldn't be read. */
  unsynced?: number | null;
} = {}) {
  countUnsyncedAccountChanges.mockResolvedValue(unsynced);
  useAuthStore.setState({
    userId: signedIn ? 'user-1' : 'local-user-v1',
    status: signedIn ? 'authenticated' : 'guest',
    hasAppleIdentity: signedIn && apple,
    hasGoogleIdentity: signedIn && google,
    pending: false,
    deleteAccount,
    eraseDeviceData,
    countUnsyncedAccountChanges,
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

/**
 * A guest taps Erase everything, and the alert comes up once the count of what
 * accounts never pushed has been read (at the tap). `times` is how many alerts
 * there have been by then.
 */
async function tapErase(times = 1) {
  fireEvent.press(screen.getByTestId('delete-confirm-button'));
  await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(times));
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

    await tapErase();

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
    await tapErase();
    chooseInAlert('Erase');

    await waitFor(() => expect(eraseDeviceData).toHaveBeenCalled());
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(await screen.findByText('Your data has been erased')).toBeTruthy();
  });

  it('names what Erase removes and what stays (playtest 2026-11-13b, run 6)', () => {
    seed({ signedIn: false });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    const body = screen.getByText(/permanently erases/).props.children as string;
    for (const part of [
      'prediction and reflection',
      'categories and their icons',
      'practice answers',
      'still typing',
      'age range',
      'usage stats not yet sent',
      `Settings, like reminder times, and whether this phone has ${PLUS_NAME} stay.`,
    ]) {
      expect(body).toContain(part);
    }
  });

  // Review 2026-11-19: Erase keeps the Plus mirror (D71 (a)), so the body
  // names it beside the settings, in the product's own name.
  it('names Plus among what stays', () => {
    seed({ signedIn: false });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    const body = screen.getByText(/permanently erases/).props.children as string;
    expect(PLUS_NAME).toBe('Fairly Sure Plus');
    expect(body).toContain(
      'Settings, like reminder times, and whether this phone has Fairly Sure Plus stay.',
    );
    expect(body).not.toContain('Settings, like reminder times, stay.');
  });

  // Main session decision 2026-11-19 (wipeEverythingOnDevice): everything on
  // the phone, whoever's it was, so nothing says "without an account" now.
  it('says it erases everything the app keeps on this phone, an earlier account’s leftovers included', () => {
    seed({ signedIn: false });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    const body = screen.getByText(/permanently erases/).props.children as string;
    expect(body).toBe(
      'This permanently erases everything Fairly Sure keeps on this phone, including anything left by an account that was signed in here before: every prediction and reflection, your categories and their icons, your Warmup and practice answers, a prediction you were still typing, your age range and usage stats not yet sent. Settings, like reminder times, and whether this phone has Fairly Sure Plus stay. ' +
        "You aren't signed in, so nothing here has another copy unless an account backed it up. It can't be undone.",
    );
    expect(body).not.toContain('without an account');
  });

  it('says afterwards that the data on this phone is gone, an earlier account’s included', async () => {
    seed({ signedIn: false });
    eraseDeviceData.mockResolvedValue({ ok: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    await tapErase();
    chooseInAlert('Erase');
    expect(
      await screen.findByText(
        'Your data on this phone is gone, including anything left by an account that was signed in here before.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/without an account/)).toBeNull();
  });
});

// Record audit 2026-11-19, item 6: Erase removes changes accounts made on
// this phone that never reached the server, and those can't come back. The
// confirmation names how many, read at the tap, just before it asks.
describe('DeleteAccountView — guest, what accounts would lose', () => {
  const LEAD = 'Nothing here has another copy unless an account backed it up.';

  it.each([
    ['none', 0, GUEST_MESSAGE],
    ['a count that couldn’t be read', null, UNREAD_MESSAGE],
  ])('asks with %s', async (_label, unsynced, message) => {
    seed({ signedIn: false, unsynced });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    // Nothing read before the tap.
    expect(countUnsyncedAccountChanges).not.toHaveBeenCalled();

    await tapErase();
    expect(countUnsyncedAccountChanges).toHaveBeenCalledTimes(1);
    expect(lastAlert().title).toBe('Erase everything on this phone?');
    expect(lastAlert().message).toBe(message);
  });

  it('words each case: none, one, three, and a count that couldn’t be read', () => {
    expect(eraseConfirmMessage(0)).toBe(
      "Nothing here has another copy unless an account backed it up. This can't be undone.",
    );
    expect(eraseConfirmMessage(1)).toBe(
      "Nothing here has another copy unless an account backed it up. 1 change an account made on this phone never reached our server and will be lost. This can't be undone.",
    );
    expect(eraseConfirmMessage(3)).toBe(
      "Nothing here has another copy unless an account backed it up. 3 changes an account made on this phone never reached our server and will be lost. This can't be undone.",
    );
    expect(eraseConfirmMessage(null)).toBe(
      "Nothing here has another copy unless an account backed it up. Changes an account made on this phone may not have reached our server; if so, they will be lost. This can't be undone.",
    );
    // No read gives these; each reads as a count that couldn't be read, never as none.
    for (const odd of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(eraseConfirmMessage(odd)).toBe(UNREAD_MESSAGE);
    }
  });

  it('names one change in the singular', async () => {
    seed({ signedIn: false, unsynced: 1 });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    await tapErase();
    expect(lastAlert().message).toBe(
      "Nothing here has another copy unless an account backed it up. 1 change an account made on this phone never reached our server and will be lost. This can't be undone.",
    );
  });

  it('names three changes', async () => {
    seed({ signedIn: false, unsynced: 3 });
    eraseDeviceData.mockResolvedValue({ ok: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    await tapErase();
    const { title, message, buttons } = lastAlert();
    expect(title).toBe('Erase everything on this phone?');
    expect(message).toBe(
      "Nothing here has another copy unless an account backed it up. 3 changes an account made on this phone never reached our server and will be lost. This can't be undone.",
    );
    expect(buttons.map(({ text, style }) => ({ text, style }))).toEqual([
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive' },
    ]);
    // Asking erased nothing; Erase does.
    expect(eraseDeviceData).not.toHaveBeenCalled();
    chooseInAlert('Erase');
    expect(await screen.findByText('Your data has been erased')).toBeTruthy();
    expect(eraseDeviceData).toHaveBeenCalledTimes(1);
  });

  it('groups a large count the English way', () => {
    expect(eraseConfirmMessage(1234)).toBe(
      `${LEAD} 1,234 changes an account made on this phone never reached our server and will be lost. This can't be undone.`,
    );
  });

  it('reads the count again at a second tap', async () => {
    seed({ signedIn: false });
    countUnsyncedAccountChanges.mockResolvedValueOnce(1).mockResolvedValueOnce(3);
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    await tapErase(1);
    expect(lastAlert().message).toContain('1 change an account made');
    chooseInAlert('Cancel');

    await tapErase(2);
    expect(countUnsyncedAccountChanges).toHaveBeenCalledTimes(2);
    expect(lastAlert().message).toContain('3 changes an account made');
  });

  it('opens one alert for a second tap while the count is still being read', async () => {
    seed({ signedIn: false });
    let finish: (n: number | null) => void = () => {};
    countUnsyncedAccountChanges.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    // Shown while it reads: the button is off, under its own label (nothing
    // is being erased yet), and Cancel stays on.
    expect(screen.getByTestId('delete-confirm-button')).toBeDisabled();
    expect(screen.getByTestId('delete-confirm-button')).toHaveTextContent('Erase everything');
    expect(screen.getByTestId('delete-cancel')).not.toBeDisabled();
    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    expect(countUnsyncedAccountChanges).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();

    await act(async () => finish(2));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(lastAlert().message).toContain('2 changes an account made');
    expect(screen.getByTestId('delete-confirm-button')).not.toBeDisabled();
  });

  // Re-review 2026-11-19: the read waits behind queued database work, so the
  // question doesn't wait on it for more than 3 seconds.
  describe('a count that hasn’t come back', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function neverAnswers() {
      let finish: (n: number | null) => void = () => {};
      countUnsyncedAccountChanges.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      return (n: number | null) => finish(n);
    }

    it('asks after 3 seconds as if it couldn’t be read, and drops a count that comes later', async () => {
      seed({ signedIn: false });
      const late = neverAnswers();
      render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

      fireEvent.press(screen.getByTestId('delete-confirm-button'));
      await act(async () => {});
      expect(screen.getByTestId('delete-confirm-button')).toBeDisabled();
      await act(async () => {
        jest.advanceTimersByTime(ERASE_COUNT_WAIT_MS - 1);
      });
      expect(alertSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId('delete-confirm-button')).toBeDisabled();

      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(lastAlert().title).toBe('Erase everything on this phone?');
      expect(lastAlert().message).toBe(UNREAD_MESSAGE);
      expect(screen.getByTestId('delete-confirm-button')).not.toBeDisabled();
      expect(ERASE_COUNT_WAIT_MS).toBe(3000);

      // The count arriving afterwards opens nothing more.
      await act(async () => late(4));
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    it('asks once, at the count, when it comes back in time', async () => {
      seed({ signedIn: false });
      const answer = neverAnswers();
      render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

      fireEvent.press(screen.getByTestId('delete-confirm-button'));
      await act(async () => {
        jest.advanceTimersByTime(ERASE_COUNT_WAIT_MS - 1);
      });
      await act(async () => answer(0));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(lastAlert().message).toBe(GUEST_MESSAGE);

      // Its timer went with it.
      await act(async () => {
        jest.advanceTimersByTime(ERASE_COUNT_WAIT_MS * 2);
      });
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    it('asks nothing once the screen has gone, and its timer goes with it', async () => {
      seed({ signedIn: false });
      neverAnswers();
      const view = render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
      // Which timer is the wait, and whether it is cleared: wrapped by hand
      // and put back here, not with jest.spyOn, whose restore in the file's
      // afterEach would put the fake timers back for the tests after this one.
      const fakeSet = global.setTimeout;
      const fakeClear = global.clearTimeout;
      const waits: unknown[] = [];
      const cleared: unknown[] = [];
      global.setTimeout = ((handler: () => void, ms?: number) => {
        const id = fakeSet(handler, ms);
        if (ms === ERASE_COUNT_WAIT_MS) waits.push(id);
        return id;
      }) as typeof setTimeout;
      global.clearTimeout = ((id?: Parameters<typeof clearTimeout>[0]) => {
        cleared.push(id);
        fakeClear(id);
      }) as typeof clearTimeout;
      try {
        fireEvent.press(screen.getByTestId('delete-confirm-button'));
        await act(async () => {});
        expect(waits).toHaveLength(1);
        expect(cleared).not.toContain(waits[0]);
        view.unmount();
        expect(cleared).toContain(waits[0]);
      } finally {
        global.setTimeout = fakeSet;
        global.clearTimeout = fakeClear;
      }
      await act(async () => {
        jest.advanceTimersByTime(ERASE_COUNT_WAIT_MS * 2);
      });
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  it('asks nothing when the screen has gone before the count came back', async () => {
    seed({ signedIn: false });
    let finish: (n: number | null) => void = () => {};
    countUnsyncedAccountChanges.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    view.unmount();
    await act(async () => finish(2));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('says such changes may exist when the count throws', async () => {
    seed({ signedIn: false });
    countUnsyncedAccountChanges.mockRejectedValueOnce(new Error('disk'));
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    await tapErase();
    expect(lastAlert().message).toBe(UNREAD_MESSAGE);
  });

  it('never counts for a signed-in deletion', () => {
    seed({ unsynced: 3 });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.press(screen.getByTestId('delete-confirm-button'));
    expect(lastAlert().message).toBe(SIGNED_IN_MESSAGE);
    expect(countUnsyncedAccountChanges).not.toHaveBeenCalled();
  });
});

describe('DeleteAccountView — Cancel in the alert', () => {
  it.each([
    ['signed in', true],
    ['guest', false],
  ])('deletes and erases nothing, and stays on the screen (%s)', async (_label, signedIn) => {
    seed({ signedIn });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    // A guest's alert waits for the count, read at the tap.
    await tapErase();
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

    await tapErase();
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
  // "About", not "up to": the worst case is about 65 seconds (round 5).
  it('says it can take about a minute, under the disabled button', () => {
    seed();
    useAuthStore.setState({ pending: true });
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByTestId('delete-confirm-button')).toBeDisabled();
    expect(screen.getByTestId('delete-confirm-button')).toHaveTextContent('Deleting…');
    const note = screen.getByTestId('delete-pending-note');
    expect(note).toHaveTextContent('This can take about a minute.');
    expect(screen.queryByText(/up to a minute/)).toBeNull();
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
// where to remove the app, in Apple's own path (support.apple.com/en-us/102571),
// ending on its last step, the app removed (round 5).
describe('DeleteAccountView — Sign in with Apple not revoked', () => {
  const REMOVE_NOTE =
    'Sign in with Apple may still list Fairly Sure. To remove it, open Settings, tap your name, then Sign in with Apple, and remove Fairly Sure.';

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
    await tapErase();
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

    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(`Erase everything on this phone?\n\n${GUEST_MESSAGE}`),
    );
    expect(alertSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('Your data has been erased')).toBeTruthy();
  });

  it('names what accounts would lose in the browser’s confirm too', async () => {
    seed({ signedIn: false, unsynced: 3 });
    confirm.mockReturnValue(false);
    render(<DeleteAccountView onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-confirm-button'));

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledWith(
      "Erase everything on this phone?\n\nNothing here has another copy unless an account backed it up. 3 changes an account made on this phone never reached our server and will be lost. This can't be undone.",
    );
    expect(eraseDeviceData).not.toHaveBeenCalled();
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
