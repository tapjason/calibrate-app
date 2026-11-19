import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, Platform, StyleSheet } from 'react-native';

import { colors, type } from '@/constants/theme';
import { SIGN_OUT_CHECK_FAILED, useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { __resetLockStoreForTests, useLockStore } from '@/store/lockStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { SIGN_OUT_FAILED as SIGN_OUT_FAILED_CONST } from '@/supabase/auth';
import { FREE_ENTITLEMENT } from '@/types';

import {
  reminderWordsLine,
  SettingsView,
  SIGN_OUT_ANYWAY_TITLE,
  unsyncedSignOutLine,
  USAGE_STATS_DESCRIPTION,
} from './SettingsView';

// Refine is CUT from the release (`REFINE_ENABLED = false`), so these tests
// force the flag on. The behavior stays covered while the feature is dormant,
// which is the point of keeping the code rather than deleting it. That the cut
// itself holds is asserted in the companion `*.refineCut.test.tsx` file.
jest.mock('@/constants/app', () => ({
  ...jest.requireActual('@/constants/app'),
  REFINE_ENABLED: true,
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));

beforeEach(() => {
  // In-memory persistence so toggling doesn't touch native AsyncStorage.
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  useEntitlementStore.setState({
    entitlement: FREE_ENTITLEMENT,
    isPlus: false,
    hydrated: true,
  });
});

afterEach(() => {
  __setPersistenceForTests(null);
});

describe('SettingsView', () => {
  it('reflects the current toggle state from the store', () => {
    useSettingsStore.setState({
      notificationsEnabled: false,
      aiRefineEnabled: true,
    });
    render(<SettingsView />);

    const checked = (id: string) => screen.getByTestId(id).props.accessibilityState.checked;
    expect(checked('toggle-notifications-row')).toBe(false);
    expect(checked('toggle-ai-refine-row')).toBe(true);
  });

  it('updates the store when notifications is toggled off', async () => {
    render(<SettingsView />);
    expect(useSettingsStore.getState().notificationsEnabled).toBe(true);

    fireEvent.press(screen.getByTestId('toggle-notifications-row'));

    await waitFor(() => {
      expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
    });
  });

  it('updates the store when AI refine is toggled off', async () => {
    render(<SettingsView />);

    fireEvent.press(screen.getByTestId('toggle-ai-refine-row'));

    await waitFor(() => {
      expect(useSettingsStore.getState().aiRefineEnabled).toBe(false);
    });
  });

  // Step 173 (aggregate B5): the streak and daily goal can be hidden.
  it('switches the streak and daily goal off', async () => {
    __setPersistenceForTests({ load: async () => null, save: async () => {} });
    render(<SettingsView />);
    fireEvent.press(screen.getByTestId('toggle-streak-row'));
    await waitFor(() => expect(useSettingsStore.getState().streakShown).toBe(false));
  });

  // D61 (blind playtest 2026-11-13c, finding 7): off by default, one tap on.
  it('hides the words on Today and History when asked', async () => {
    __setPersistenceForTests({ load: async () => null, save: async () => {} });
    useSettingsStore.setState({ hideTitles: false });
    render(<SettingsView />);
    fireEvent.press(screen.getByTestId('toggle-hide-titles-row'));
    await waitFor(() => expect(useSettingsStore.getState().hideTitles).toBe(true));
    useSettingsStore.setState({ hideTitles: false });
  });

  it('persists the change through the store setter', async () => {
    const saved: unknown[] = [];
    __setPersistenceForTests({
      load: async () => null,
      save: async (s) => {
        saved.push(s);
      },
    });
    render(<SettingsView />);

    fireEvent.press(screen.getByTestId('toggle-notifications-row'));

    await waitFor(() => {
      expect(saved).toContainEqual({
        notificationsEnabled: false,
        remindersEnabled: true,
        digestEnabled: true,
        dueReminderTime: { hour: 19, minute: 0 },
        digestDay: 0,
        digestTime: { hour: 18, minute: 0 },
        aiRefineEnabled: true,
        coachEnabled: false,
        analyticsEnabled: true,
        streakShown: true,
        reminderWords: false,
        hideTitles: false,
        appLock: false,
        cardThemeId: 'midnight',
        cardFormat: 'post',
        cardHiddenCategories: [],
        coverageNudgeLastShownAt: null,
        reminderPromptDismissedAt: null,
        reminderPromptDismissals: 0,
        backupNudgeDismissedAt: null,
        welcomeBackDismissedFor: null,
        ratingAskedAt: null,
        practiceReminder: null,
        practiceReminderOfferDismissedAt: null,
        streakMomentDay: null,
        usageNoticeShownAt: null,
      });
    });
  });

  // Guideline 5.1.2(i): the toggle that sends data to an AI discloses that a
  // third-party AI service gets it, before anything is sent.
  it('names a third-party AI service on the Coach toggle', () => {
    render(<SettingsView />);
    const description = screen.getByText(/to a third-party AI service/);
    expect(description).toBeTruthy();
    expect(description.props.children).not.toMatch(/OpenAI/);
  });

  // Blind playtest 2026-11-01: a free user switched Coach on and nothing
  // happened. On, it now says it waits for Plus.
  it('says what the Coach switch does without Plus, and with it', () => {
    const hint = () => screen.getByTestId('toggle-coach-row').props.accessibilityHint as string;
    useSettingsStore.setState({ coachEnabled: false });
    const view = render(<SettingsView />);
    expect(hint()).toMatch(/^Plus only\. /);

    fireEvent.press(screen.getByTestId('toggle-coach-row'));
    expect(hint()).toMatch(/^On for when you have Plus\. Nothing is sent before then\. /);
    view.unmount();

    useEntitlementStore.setState({
      entitlement: { is_plus: true, source: 'annual', expires_at: null },
      isPlus: true,
    });
    render(<SettingsView />);
    expect(hint()).toMatch(/^When you ask for feedback/);
  });

  // Policy audit F7 (2026-11-18): every row has a random event id, so a
  // guest's counts don't go up with "no id at all"; none names an account, a
  // device or an install. Policy re-audit N2 (2026-11-19): the events carry
  // numbers too (an answer's confidence and whether it happened, the Warm-up's
  // score), so "counts of which features get used" undersold them.
  it('says what a guest’s counts carry no id of, and only that', () => {
    render(<SettingsView />);
    expect(USAGE_STATS_DESCRIPTION).toBe(
      "Which features get used, with numbers like the confidence you chose and whether it happened. Never the words of your predictions or notes. Before you sign in, a few counts go up with no account, device or install id; once you sign in, they're tied to your account. Turning this off deletes what's queued.",
    );
    expect(USAGE_STATS_DESCRIPTION).not.toMatch(/no id at all/);
    expect(USAGE_STATS_DESCRIPTION).not.toMatch(/^Counts of which features/);
    // No em dash in the app's voice.
    expect(USAGE_STATS_DESCRIPTION).not.toContain('—');
    expect(screen.getByTestId('toggle-analytics-row').props.accessibilityHint).toBe(
      USAGE_STATS_DESCRIPTION,
    );
  });

  // Roadmap step 41: a bare Switch was an unnamed "switch, on" to VoiceOver.
  it('names each switch by its row, with the description as the hint', () => {
    render(<SettingsView />);
    const row = screen.getByTestId('toggle-coach-row');
    expect(row.props.accessibilityRole).toBe('switch');
    expect(row.props.accessibilityLabel).toBe('Coach (AI)');
    expect(row.props.accessibilityHint).toMatch(/third-party AI service/);
    expect(row.props.accessibilityHint).not.toMatch(/OpenAI/);
    expect(screen.queryByTestId('toggle-coach')).toBeNull(); // the inner Switch is hidden
  });

  // Roadmap step 80: rows that open something are whole-row buttons named
  // by their label, not capsules inside a row.
  it('opens things from whole rows, named by their labels', () => {
    const onOpenCard = jest.fn();
    const onOpenScoring = jest.fn();
    render(<SettingsView onOpenCard={onOpenCard} onOpenScoring={onOpenScoring} />);
    const card = screen.getByTestId('settings-card');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityLabel).toBe('Your card');
    fireEvent.press(card);
    expect(onOpenCard).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('settings-scoring').props.accessibilityLabel).toBe(
      'How scoring works',
    );
    // No capsule buttons left: every button on the screen is a row or a switch.
    expect(screen.queryByText('Read')).toBeNull();
    expect(screen.queryByText('See Plus')).toBeNull();
  });

  it('links to How scoring works', () => {
    const onOpenScoring = jest.fn();
    render(<SettingsView onOpenScoring={onOpenScoring} />);
    fireEvent.press(screen.getByTestId('settings-scoring'));
    expect(onOpenScoring).toHaveBeenCalledTimes(1);
  });

  // Guideline 5.1.1(i): both legal links render, and Privacy opens the hosted policy.
  it('links the terms and the hosted privacy policy', () => {
    const { openBrowserAsync } = jest.requireMock('expo-web-browser');
    render(<SettingsView />);
    expect(screen.getByTestId('settings-terms-link')).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-privacy-link'));
    expect(openBrowserAsync).toHaveBeenLastCalledWith(
      'https://tapjason.github.io/calibrate-app/privacy/',
    );
    fireEvent.press(screen.getByTestId('settings-terms-link'));
    expect(openBrowserAsync).toHaveBeenLastCalledWith(
      'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
    );
  });

  it('offers a route to Plus for a free user', () => {
    const onOpenPaywall = jest.fn();
    render(<SettingsView onOpenPaywall={onOpenPaywall} />);

    fireEvent.press(screen.getByTestId('settings-plus'));
    expect(onOpenPaywall).toHaveBeenCalled();
  });

  // Settings is the permanent route to Restore Purchases — the paywall carries
  // the button, and a subscriber who reinstalled has no other way in.
  it('keeps the route available to an existing subscriber', () => {
    useEntitlementStore.setState({
      entitlement: { is_plus: true, source: 'annual', expires_at: null },
      isPlus: true,
    });
    render(<SettingsView onOpenPaywall={jest.fn()} />);

    expect(screen.getByTestId('settings-plus')).toBeTruthy();
    expect(screen.getByText(/Active\./)).toBeTruthy();
  });
});

describe('SettingsView — account', () => {
  const signOut = jest.fn().mockResolvedValue({ ok: true });

  beforeEach(() => {
    signOut.mockClear();
  });

  it('offers sign-in to a guest, and says where their data lives', () => {
    useAuthStore.setState({
      accountsAvailable: true,
      status: 'guest',
      email: null,
    });
    const onOpenAccount = jest.fn();
    render(<SettingsView onOpenAccount={onOpenAccount} />);

    expect(screen.getByText(/live only on this phone/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-sign-in'));
    expect(onOpenAccount).toHaveBeenCalledTimes(1);
  });

  it('shows who is signed in and signs out without a confirmation', () => {
    useAuthStore.setState({
      accountsAvailable: true,
      status: 'authenticated',
      email: 'a@b.co',
      signOut,
    });
    render(<SettingsView />);

    expect(screen.getByText(/Signed in as a@b\.co\./)).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-sign-out'));
    expect(signOut).toHaveBeenCalledTimes(1);
    // Everything reached the server: nothing to ask, and nothing discarded.
    expect(signOut).toHaveBeenCalledWith();
  });

  // D69 (a): sign-out takes the account's predictions off this phone, and
  // signing back in brings back what the server has. The row says so, and
  // nothing says they stay. What never syncs goes for good (the categories
  // table, D39 and D40), and the row says that too (round 5, 2026-11-19: it
  // promised everything came back). Round 6: sign-out keeps the counts only
  // this phone keeps, so the row no longer says it removes them.
  it('says signing out removes the predictions from this phone and signing in brings them back', () => {
    useAuthStore.setState({
      accountsAvailable: true,
      status: 'authenticated',
      email: 'a@b.co',
      signOut,
    });
    render(<SettingsView />);

    expect(
      screen.getByText(
        'Signed in as a@b.co. Your predictions are backed up. Signing out removes them from this phone, and signing back in brings them back. Categories you added or changed live only on this phone, so signing out removes them.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/stay on this phone|kept on this phone/)).toBeNull();
    expect(screen.queryByText(/counts only this phone keeps/)).toBeNull();
  });

  // Security review, 2026-11-18: the store returns how the sign-out ended.
  describe('what sign-out says', () => {
    const SIGN_OUT_FAILED = "Couldn't sign you out on this phone. Try again.";
    let announce: jest.SpyInstance;

    beforeEach(() => {
      announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    });
    afterEach(() => announce.mockRestore());

    /** A sign-out that waits until `finish` is called with its outcome. */
    function slowSignOut() {
      let finish!: (outcome: unknown) => void;
      const fn = jest.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      return { fn, finish: (outcome: unknown) => finish(outcome) };
    }

    function signedIn(fn: jest.Mock) {
      useAuthStore.setState({
        accountsAvailable: true,
        status: 'authenticated',
        email: 'a@b.co',
        pending: false,
        signOut: fn,
      });
    }

    it('shows that it is working and takes no second tap until it ends', async () => {
      const slow = slowSignOut();
      signedIn(slow.fn);
      render(<SettingsView />);

      fireEvent.press(screen.getByTestId('settings-sign-out'));
      await waitFor(() =>
        expect(screen.getByTestId('settings-sign-out')).toHaveTextContent('Signing out…'),
      );
      expect(screen.getByTestId('settings-sign-out')).toBeDisabled();
      fireEvent.press(screen.getByTestId('settings-sign-out'));
      expect(slow.fn).toHaveBeenCalledTimes(1);

      await act(async () => slow.finish({ ok: false, error: SIGN_OUT_FAILED }));
      expect(screen.getByTestId('settings-sign-out')).toHaveTextContent('Sign out');
      expect(screen.getByTestId('settings-sign-out')).toBeEnabled();
    });

    it("shows the store's words in the error style, and says them, when it fails", async () => {
      const signOut = jest.fn().mockResolvedValue({ ok: false, error: SIGN_OUT_FAILED });
      signedIn(signOut);
      render(<SettingsView />);

      fireEvent.press(screen.getByTestId('settings-sign-out'));

      const error = await screen.findByTestId('settings-sign-out-error');
      expect(error).toHaveTextContent(SIGN_OUT_FAILED);
      expect(StyleSheet.flatten(error.props.style)).toMatchObject({
        fontSize: type.subhead.fontSize,
        color: colors.destructive,
      });
      expect(announce).toHaveBeenCalledWith(SIGN_OUT_FAILED);
      // Still signed in, and free to try again.
      expect(screen.getByText(/Signed in as a@b\.co\./)).toBeTruthy();
      expect(screen.getByTestId('settings-sign-out')).toBeEnabled();
    });

    it('clears the error on the next try', async () => {
      const signOut = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, error: SIGN_OUT_FAILED })
        .mockResolvedValueOnce({ ok: true });
      signedIn(signOut);
      render(<SettingsView />);

      fireEvent.press(screen.getByTestId('settings-sign-out'));
      expect(await screen.findByTestId('settings-sign-out-error')).toBeTruthy();
      await waitFor(() => expect(screen.getByTestId('settings-sign-out')).toBeEnabled());
      fireEvent.press(screen.getByTestId('settings-sign-out'));
      await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByTestId('settings-sign-out-error')).toBeNull());
    });

    it.each([
      ['the server took it', { ok: true }],
      ['it ended on this phone alone', { ok: true, localOnly: true }],
    ])('says nothing when %s', async (_label, outcome) => {
      const signOut = jest.fn().mockResolvedValue(outcome);
      signedIn(signOut);
      render(<SettingsView />);

      fireEvent.press(screen.getByTestId('settings-sign-out'));

      await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(screen.getByTestId('settings-sign-out')).toHaveTextContent('Sign out'),
      );
      expect(screen.queryByTestId('settings-sign-out-error')).toBeNull();
      expect(announce).not.toHaveBeenCalled();
    });

    // Round 5: what's unsynced couldn't be counted, so nothing changed. Both
    // failures are the store's own words, shown and said the same way.
    it.each([
      ['the session could not be ended', SIGN_OUT_FAILED_CONST],
      ['what is unsynced could not be counted', SIGN_OUT_CHECK_FAILED],
    ])('shows and says the error when %s', async (_label, message) => {
      const signOut = jest.fn().mockResolvedValue({ ok: false, error: message });
      signedIn(signOut);
      render(<SettingsView />);

      fireEvent.press(screen.getByTestId('settings-sign-out'));

      expect(await screen.findByTestId('settings-sign-out-error')).toHaveTextContent(message);
      expect(announce).toHaveBeenCalledWith(message);
      expect(screen.getByText(/Signed in as a@b\.co\./)).toBeTruthy();
    });
  });

  // D69 (a): sign-out takes the account's rows off this phone. When this
  // phone holds changes the server doesn't have, or categories only it has
  // (round 6, N1), the store changes nothing and says how many of each; the
  // screen asks before going on.
  describe('when changes have not reached the server', () => {
    let alertSpy: jest.SpyInstance<void, Parameters<typeof Alert.alert>>;
    let announce: jest.SpyInstance;

    beforeEach(() => {
      expect(Platform.OS).toBe('ios');
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    });
    afterEach(() => {
      alertSpy.mockRestore();
      announce.mockRestore();
      __resetLockStoreForTests();
    });

    function signedIn(fn: jest.Mock) {
      useAuthStore.setState({
        accountsAvailable: true,
        status: 'authenticated',
        email: 'a@b.co',
        pending: false,
        signOut: fn,
      });
    }

    function lastAlert() {
      const calls = alertSpy.mock.calls;
      if (calls.length === 0) throw new Error('No alert was shown');
      const [title, message, buttons] = calls[calls.length - 1];
      return { title, message, buttons: buttons ?? [] };
    }

    function chooseInAlert(label: string) {
      const button = lastAlert().buttons.find((b) => b.text === label);
      if (!button) throw new Error(`The alert has no "${label}" button`);
      act(() => {
        button.onPress?.();
      });
    }

    async function pressSignOutAndWaitForAlert() {
      await waitFor(() => expect(screen.getByTestId('settings-sign-out')).toBeEnabled());
      fireEvent.press(screen.getByTestId('settings-sign-out'));
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
      // The first call is done: the row is free again under the alert.
      await waitFor(() =>
        expect(screen.getByTestId('settings-sign-out')).toHaveTextContent('Sign out'),
      );
    }

    it('asks first, in a system alert with Cancel and a destructive Sign out', async () => {
      const signOut = jest.fn().mockResolvedValue({ ok: false, unsynced: 3, localCategories: 0 });
      signedIn(signOut);
      render(<SettingsView />);

      await pressSignOutAndWaitForAlert();

      const { title, message, buttons } = lastAlert();
      expect(title).toBe('Sign out anyway?');
      expect(title).toBe(SIGN_OUT_ANYWAY_TITLE);
      expect(message).toBe("3 changes haven't reached the server yet and may not if you sign out now.");
      expect(buttons.map(({ text, style }) => ({ text, style }))).toEqual([
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive' },
      ]);
      // Asked once, discarding nothing; no error, nothing said over the alert.
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(signOut).toHaveBeenCalledWith();
      expect(screen.queryByTestId('settings-sign-out-error')).toBeNull();
      expect(announce).not.toHaveBeenCalled();
      expect(screen.getByText(/Signed in as a@b\.co\./)).toBeTruthy();
    });

    it('signs out discarding them once Sign out is chosen, and says nothing when that works', async () => {
      const signOut = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, unsynced: 1, localCategories: 0 })
        .mockResolvedValueOnce({ ok: true });
      signedIn(signOut);
      render(<SettingsView />);

      await pressSignOutAndWaitForAlert();
      expect(lastAlert().message).toBe(
        "1 change hasn't reached the server yet and may not if you sign out now.",
      );
      chooseInAlert('Sign out');

      await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2));
      expect(signOut).toHaveBeenNthCalledWith(1);
      expect(signOut).toHaveBeenNthCalledWith(2, { discardUnsynced: true });
      await waitFor(() =>
        expect(screen.getByTestId('settings-sign-out')).toHaveTextContent('Sign out'),
      );
      expect(screen.queryByTestId('settings-sign-out-error')).toBeNull();
      expect(announce).not.toHaveBeenCalled();
      // Asked once only.
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    it("shows and says the confirmed sign-out's error, as for any sign-out", async () => {
      const signOut = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, unsynced: 2, localCategories: 0 })
        .mockResolvedValueOnce({ ok: false, error: SIGN_OUT_FAILED_CONST });
      signedIn(signOut);
      render(<SettingsView />);

      await pressSignOutAndWaitForAlert();
      chooseInAlert('Sign out');

      expect(await screen.findByTestId('settings-sign-out-error')).toHaveTextContent(
        SIGN_OUT_FAILED_CONST,
      );
      expect(announce).toHaveBeenCalledWith(SIGN_OUT_FAILED_CONST);
      expect(signOut).toHaveBeenNthCalledWith(2, { discardUnsynced: true });
      expect(screen.getByText(/Signed in as a@b\.co\./)).toBeTruthy();
      await waitFor(() => expect(screen.getByTestId('settings-sign-out')).toBeEnabled());
    });

    it('changes nothing when Cancel is chosen', async () => {
      const signOut = jest.fn().mockResolvedValue({ ok: false, unsynced: 4, localCategories: 0 });
      signedIn(signOut);
      render(<SettingsView />);

      await pressSignOutAndWaitForAlert();
      chooseInAlert('Cancel');
      await act(async () => {
        await Promise.resolve();
      });

      expect(signOut).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Signed in as a@b\.co\./)).toBeTruthy();
      expect(screen.queryByTestId('settings-sign-out-error')).toBeNull();
      expect(screen.getByTestId('settings-sign-out')).toBeEnabled();
    });

    // The alert has its own window, above the app lock: left up when the
    // person went Home, its Sign out must do nothing for whoever opens the
    // app next (security review, 2026-11-18).
    it('does nothing when Sign out is pressed while the app is locked', async () => {
      const signOut = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, unsynced: 2, localCategories: 0 })
        .mockResolvedValueOnce({ ok: true });
      signedIn(signOut);
      render(<SettingsView />);

      await pressSignOutAndWaitForAlert();
      act(() => useLockStore.setState({ locked: true }));
      chooseInAlert('Sign out');
      await act(async () => {
        await Promise.resolve();
      });

      expect(signOut).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Signed in as a@b\.co\./)).toBeTruthy();
      expect(screen.queryByTestId('settings-sign-out-error')).toBeNull();
    });

    it('works as before once the lock is open again', async () => {
      const signOut = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, unsynced: 2, localCategories: 0 })
        .mockResolvedValueOnce({ ok: true });
      signedIn(signOut);
      render(<SettingsView />);

      await pressSignOutAndWaitForAlert();
      act(() => useLockStore.setState({ locked: true }));
      act(() => useLockStore.setState({ locked: false }));
      chooseInAlert('Sign out');

      await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2));
      expect(signOut).toHaveBeenNthCalledWith(2, { discardUnsynced: true });
    });

    // Round 6, N1: categories only this phone has go with the account's rows,
    // so they are asked about too, alone when nothing else is at stake.
    it('names the categories that live only on this phone when no change is unsynced', async () => {
      const signOut = jest.fn().mockResolvedValue({ ok: false, unsynced: 0, localCategories: 3 });
      signedIn(signOut);
      render(<SettingsView />);

      await pressSignOutAndWaitForAlert();

      const { title, message, buttons } = lastAlert();
      expect(title).toBe(SIGN_OUT_ANYWAY_TITLE);
      expect(message).toBe(
        '3 categories you added or changed live only on this phone and will be removed.',
      );
      expect(message).not.toMatch(/server|change hasn|changes haven/);
      expect(buttons.map(({ text, style }) => ({ text, style }))).toEqual([
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive' },
      ]);
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(signOut).toHaveBeenCalledWith();
    });

    it('names both, the changes first, when both are at stake', async () => {
      const signOut = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, unsynced: 2, localCategories: 1 })
        .mockResolvedValueOnce({ ok: true });
      signedIn(signOut);
      render(<SettingsView />);

      await pressSignOutAndWaitForAlert();
      expect(lastAlert().message).toBe(
        "2 changes haven't reached the server yet and may not if you sign out now. 1 category you added or changed lives only on this phone and will be removed.",
      );
      chooseInAlert('Sign out');

      await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2));
      expect(signOut).toHaveBeenNthCalledWith(2, { discardUnsynced: true });
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    // Round 6, N2: anything new by the time of the confirmed sign-out stops
    // it, and the store asks again with the new counts. The screen asks again
    // each time, with those counts, until a sign-out goes or the person
    // cancels.
    it('asks again, with the new counts, each time the store asks again', async () => {
      const signOut = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, unsynced: 1, localCategories: 0 })
        .mockResolvedValueOnce({ ok: false, unsynced: 2, localCategories: 1 })
        .mockResolvedValueOnce({ ok: false, unsynced: 0, localCategories: 2 })
        .mockResolvedValueOnce({ ok: true });
      signedIn(signOut);
      render(<SettingsView />);

      await pressSignOutAndWaitForAlert();
      expect(lastAlert().message).toBe(
        "1 change hasn't reached the server yet and may not if you sign out now.",
      );
      chooseInAlert('Sign out');

      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2));
      expect(lastAlert().title).toBe(SIGN_OUT_ANYWAY_TITLE);
      expect(lastAlert().message).toBe(
        "2 changes haven't reached the server yet and may not if you sign out now. 1 category you added or changed lives only on this phone and will be removed.",
      );
      expect(lastAlert().buttons.map(({ text, style }) => ({ text, style }))).toEqual([
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive' },
      ]);
      await waitFor(() =>
        expect(screen.getByTestId('settings-sign-out')).toHaveTextContent('Sign out'),
      );
      chooseInAlert('Sign out');

      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(3));
      expect(lastAlert().message).toBe(
        '2 categories you added or changed live only on this phone and will be removed.',
      );
      chooseInAlert('Sign out');

      await waitFor(() => expect(signOut).toHaveBeenCalledTimes(4));
      expect(signOut).toHaveBeenNthCalledWith(1);
      expect(signOut).toHaveBeenNthCalledWith(2, { discardUnsynced: true });
      expect(signOut).toHaveBeenNthCalledWith(3, { discardUnsynced: true });
      expect(signOut).toHaveBeenNthCalledWith(4, { discardUnsynced: true });
      await waitFor(() =>
        expect(screen.getByTestId('settings-sign-out')).toHaveTextContent('Sign out'),
      );
      // The sign-out went: no fourth question, no error, nothing said.
      expect(alertSpy).toHaveBeenCalledTimes(3);
      expect(screen.queryByTestId('settings-sign-out-error')).toBeNull();
      expect(announce).not.toHaveBeenCalled();
    });

    it('changes nothing more when the repeated question is cancelled', async () => {
      const signOut = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, unsynced: 1, localCategories: 0 })
        .mockResolvedValueOnce({ ok: false, unsynced: 2, localCategories: 0 })
        .mockResolvedValueOnce({ ok: true });
      signedIn(signOut);
      render(<SettingsView />);

      await pressSignOutAndWaitForAlert();
      chooseInAlert('Sign out');
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2));
      expect(lastAlert().message).toBe(
        "2 changes haven't reached the server yet and may not if you sign out now.",
      );
      chooseInAlert('Cancel');
      await act(async () => {
        await Promise.resolve();
      });

      expect(signOut).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/Signed in as a@b\.co\./)).toBeTruthy();
      expect(screen.queryByTestId('settings-sign-out-error')).toBeNull();
      await waitFor(() => expect(screen.getByTestId('settings-sign-out')).toBeEnabled());
    });

    it('does nothing when the repeated question is confirmed while the app is locked', async () => {
      const signOut = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, unsynced: 0, localCategories: 1 })
        .mockResolvedValueOnce({ ok: false, unsynced: 1, localCategories: 1 })
        .mockResolvedValueOnce({ ok: true });
      signedIn(signOut);
      render(<SettingsView />);

      await pressSignOutAndWaitForAlert();
      chooseInAlert('Sign out');
      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2));
      act(() => useLockStore.setState({ locked: true }));
      chooseInAlert('Sign out');
      await act(async () => {
        await Promise.resolve();
      });

      expect(signOut).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/Signed in as a@b\.co\./)).toBeTruthy();
      expect(screen.queryByTestId('settings-sign-out-error')).toBeNull();
    });

    it('names only what is above zero, with plurals, grouping large counts', () => {
      const line = (unsynced: number, localCategories: number) =>
        unsyncedSignOutLine({ unsynced, localCategories });
      expect(line(1, 0)).toBe("1 change hasn't reached the server yet and may not if you sign out now.");
      expect(line(2, 0)).toBe("2 changes haven't reached the server yet and may not if you sign out now.");
      expect(line(1234, 0)).toBe(
        "1,234 changes haven't reached the server yet and may not if you sign out now.",
      );
      expect(line(0, 1)).toBe(
        '1 category you added or changed lives only on this phone and will be removed.',
      );
      expect(line(0, 2)).toBe(
        '2 categories you added or changed live only on this phone and will be removed.',
      );
      expect(line(0, 1001)).toBe(
        '1,001 categories you added or changed live only on this phone and will be removed.',
      );
      expect(line(1, 1)).toBe(
        "1 change hasn't reached the server yet and may not if you sign out now. 1 category you added or changed lives only on this phone and will be removed.",
      );
      expect(line(5, 3)).toBe(
        "5 changes haven't reached the server yet and may not if you sign out now. 3 categories you added or changed live only on this phone and will be removed.",
      );
      // A deletion not yet sent stays on this phone through a sign-out and is
      // sent when the same account signs in here again: "removes them from
      // this phone" was untrue of it, and so would "won't" be.
      expect(line(2, 0)).not.toMatch(/removes|won't/);
    });

    // The store asks only with one count above zero; were it ever to ask with
    // neither, the question still says something is at stake.
    it('never asks with an empty question', () => {
      expect(unsyncedSignOutLine({ unsynced: 0, localCategories: 0 })).toBe(
        "Something on this phone hasn't reached the server yet and may not if you sign out now.",
      );
    });

    // react-native-web's Alert.alert does nothing; the web build asks with
    // the browser's confirm, as Delete account does.
    describe('on web', () => {
      const originalOS = Platform.OS;
      let confirm: jest.Mock<boolean, [string?]>;

      beforeEach(() => {
        Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
        confirm = jest.fn();
        Object.defineProperty(window, 'confirm', { value: confirm, configurable: true, writable: true });
      });
      afterEach(() => {
        Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
        delete (window as { confirm?: unknown }).confirm;
      });

      it.each([
        ['signs out discarding them on OK', true, 2],
        ['changes nothing when dismissed', false, 1],
      ])('%s', async (_label, ok, calls) => {
        confirm.mockReturnValue(ok);
        const signOut = jest
          .fn()
          .mockResolvedValueOnce({ ok: false, unsynced: 5, localCategories: 0 })
          .mockResolvedValueOnce({ ok: true });
        signedIn(signOut);
        render(<SettingsView />);

        await waitFor(() => expect(screen.getByTestId('settings-sign-out')).toBeEnabled());
        fireEvent.press(screen.getByTestId('settings-sign-out'));

        await waitFor(() =>
          expect(confirm).toHaveBeenCalledWith(
            "Sign out anyway?\n\n5 changes haven't reached the server yet and may not if you sign out now.",
          ),
        );
        expect(alertSpy).not.toHaveBeenCalled();
        await waitFor(() => expect(signOut).toHaveBeenCalledTimes(calls));
        if (ok) expect(signOut).toHaveBeenNthCalledWith(2, { discardUnsynced: true });
      });
    });
  });

  // An Apple private relay address is one the user has usually never seen.
  // The second domain is Apple's newer one (2026-08-24).
  it.each(['x7k2@privaterelay.appleid.com', 'x7k2@private.icloud.com'])(
    'names Sign in with Apple instead of a relay address (%s)',
    (email) => {
      useAuthStore.setState({ accountsAvailable: true, status: 'authenticated', email });
      render(<SettingsView />);

      expect(screen.getByText(/Signed in with Apple\./)).toBeTruthy();
      expect(screen.queryByText(/privaterelay|private\.icloud/)).toBeNull();
    },
  );

  it('shows no account row on a build where accounts cannot exist', () => {
    useAuthStore.setState({ accountsAvailable: false, status: 'guest' });
    render(<SettingsView onOpenAccount={jest.fn()} />);

    expect(screen.queryByTestId('settings-account')).toBeNull();
  });
});

describe('SettingsView — delete', () => {
  it('offers account deletion to a signed-in user', () => {
    useAuthStore.setState({ status: 'authenticated', accountsAvailable: true, email: 'a@b.co' });
    const onOpenDelete = jest.fn();
    render(<SettingsView onOpenDelete={onOpenDelete} />);

    expect(screen.getByText('Delete account')).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-delete'));
    expect(onOpenDelete).toHaveBeenCalledTimes(1);
  });

  // Apple requires guest data be deletable too. It's offered even on a build
  // with no accounts, because the data on the phone exists either way.
  it('offers a guest a way to erase this device, even without accounts', () => {
    useAuthStore.setState({ status: 'guest', accountsAvailable: false });
    render(<SettingsView onOpenDelete={jest.fn()} />);

    expect(screen.getByText('Erase your data on this phone')).toBeTruthy();
  });
});

// Roadmap D31: due-day reminders and the weekly digest each have a switch.
describe('SettingsView — notification switches', () => {
  it('shows the two switches under Notifications while it is on, and saves each', async () => {
    useSettingsStore.setState({ notificationsEnabled: true, remindersEnabled: true, digestEnabled: true });
    render(<SettingsView />);
    fireEvent.press(screen.getByTestId('toggle-digest-row'));
    await waitFor(() => expect(useSettingsStore.getState().digestEnabled).toBe(false));
    expect(useSettingsStore.getState().remindersEnabled).toBe(true);
    fireEvent.press(screen.getByTestId('toggle-reminders-row'));
    await waitFor(() => expect(useSettingsStore.getState().remindersEnabled).toBe(false));
  });

  it('hides them while Notifications is off', () => {
    useSettingsStore.setState({ notificationsEnabled: false });
    render(<SettingsView />);
    expect(screen.queryByTestId('toggle-reminders-row')).toBeNull();
    expect(screen.queryByTestId('toggle-digest-row')).toBeNull();
  });
});

// Roadmap D60 (b): what a reminder shows, and the words kept off it.
describe('SettingsView — the words in reminders', () => {
  it('says what a reminder shows, and switches the words off', async () => {
    useSettingsStore.setState({ notificationsEnabled: true, remindersEnabled: true, reminderWords: true });
    render(<SettingsView />);
    expect(screen.getByTestId('toggle-reminder-words-row').props.accessibilityHint).toBe(
      reminderWordsLine(true),
    );
    expect(reminderWordsLine(true)).toMatch(/locked iPhone/);
    expect(reminderWordsLine(false)).toMatch(/Tap it to answer/);
    // The example's date is in the phone's order, as the reminder writes it.
    const example = new Date(2026, 10, 6, 12).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    expect(reminderWordsLine(false)).toContain(`from ${example} · You said 70%`);
    fireEvent.press(screen.getByTestId('toggle-reminder-words-row'));
    await waitFor(() => expect(useSettingsStore.getState().reminderWords).toBe(false));
    expect(screen.getByTestId('toggle-reminder-words-row').props.accessibilityHint).toBe(
      reminderWordsLine(false),
    );
  });

  it('is offered only while due-day reminders are on', () => {
    useSettingsStore.setState({ notificationsEnabled: true, remindersEnabled: false });
    render(<SettingsView />);
    expect(screen.queryByTestId('toggle-reminder-words-row')).toBeNull();
  });
});

// Roadmap D38: due-day reminders and the weekly digest at the person's times.
describe('SettingsView — reminder and digest times', () => {
  it('says each time, and offers it under its switch', async () => {
    useSettingsStore.setState({
      notificationsEnabled: true,
      remindersEnabled: true,
      digestEnabled: true,
      dueReminderTime: { hour: 19, minute: 0 },
      digestDay: 0,
      digestTime: { hour: 18, minute: 0 },
    });
    render(<SettingsView />);
    expect(screen.getByTestId('toggle-reminders-row').props.accessibilityHint).toMatch(
      /^On the day each prediction comes due, at 7:00.PM.$/,
    );
    expect(screen.getByTestId('toggle-digest-row').props.accessibilityLabel).toBe('Weekly digest');
    expect(screen.getByTestId('toggle-digest-row').props.accessibilityHint).toMatch(
      /^How many are open, never their words, Sunday at 6:00.PM.$/,
    );
    expect(screen.getByTestId('settings-reminder-time')).toBeTruthy();
    // Off, no day or time that reads as still coming (blind playtest
    // 2026-11-13, run 7).
    fireEvent.press(screen.getByTestId('toggle-digest-row'));
    await waitFor(() =>
      expect(screen.getByTestId('toggle-digest-row').props.accessibilityHint).toBe(
        'How many are open, never their words, once a week.',
      ),
    );
    fireEvent.press(screen.getByTestId('toggle-digest-row'));
    await waitFor(() => expect(useSettingsStore.getState().digestEnabled).toBe(true));

    fireEvent.press(screen.getByTestId('digest-day-3'));
    await waitFor(() => expect(useSettingsStore.getState().digestDay).toBe(3));
    expect(screen.getByTestId('digest-day-3').props.accessibilityState).toMatchObject({ selected: true });
    // Named as shown, for Voice Control (blind playtest 2026-11-12, finding 2).
    expect(screen.getByTestId('digest-day-3').props.accessibilityLabel).toBe('Wed');
    expect(screen.getByTestId('digest-day-3').props.accessibilityHint).toBe('Weekly digest on Wednesday');
    expect(screen.getByTestId('toggle-digest-row').props.accessibilityHint).toMatch(/Wednesday at/);
  });

  it('hides a time while its switch is off', () => {
    useSettingsStore.setState({ notificationsEnabled: true, remindersEnabled: false, digestEnabled: false });
    render(<SettingsView />);
    expect(screen.queryByTestId('settings-reminder-time')).toBeNull();
    expect(screen.queryByTestId('settings-digest-when')).toBeNull();
  });
});

// Roadmap D31: a practice reminder at any time of day.
describe('SettingsView — practice reminder time', () => {
  it('offers Pick a time, which then reads as the chosen time', () => {
    useSettingsStore.setState({ notificationsEnabled: true, practiceReminder: null });
    const view = render(<SettingsView />);
    expect(screen.getByTestId('settings-practice-moments-custom').props.accessibilityLabel).toBe(
      'Pick a time',
    );
    view.unmount();

    // Blind playtest 2026-11-01: it still read "Pick a time" once one was picked.
    useSettingsStore.setState({ notificationsEnabled: true, practiceReminder: { hour: 6, minute: 45 } });
    render(<SettingsView />);
    const custom = screen.getByTestId('settings-practice-moments-custom');
    expect(custom).toHaveTextContent(/^Your time/);
    expect(custom.props.accessibilityLabel).toMatch(/^Your time, 6:45/);
    expect(custom.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('settings-practice-moments-coffee').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });
});

// Roadmap D31: exporting your own predictions is free.
describe('SettingsView — export', () => {
  it('offers a CSV export to a free user', () => {
    useEntitlementStore.setState({ isPlus: false });
    render(<SettingsView />);
    expect(screen.getByTestId('settings-export')).toHaveTextContent('Export predictions (CSV)');
  });
});
