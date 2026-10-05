import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { FREE_ENTITLEMENT } from '@/types';

import { SettingsView } from './SettingsView';

// Refine is CUT from the release (`REFINE_ENABLED = false`), so these tests
// force the flag on. The behavior stays covered while the feature is dormant,
// which is the point of keeping the code rather than deleting it. That the cut
// itself holds is asserted in the companion `*.refineCut.test.tsx` file.
jest.mock('@/constants/app', () => ({
  ...jest.requireActual('@/constants/app'),
  REFINE_ENABLED: true,
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

    expect(screen.getByTestId('toggle-notifications').props.value).toBe(false);
    expect(screen.getByTestId('toggle-ai-refine').props.value).toBe(true);
  });

  it('updates the store when notifications is toggled off', async () => {
    render(<SettingsView />);
    expect(useSettingsStore.getState().notificationsEnabled).toBe(true);

    fireEvent(screen.getByTestId('toggle-notifications'), 'valueChange', false);

    await waitFor(() => {
      expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
    });
  });

  it('updates the store when AI refine is toggled off', async () => {
    render(<SettingsView />);

    fireEvent(screen.getByTestId('toggle-ai-refine'), 'valueChange', false);

    await waitFor(() => {
      expect(useSettingsStore.getState().aiRefineEnabled).toBe(false);
    });
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

    fireEvent(screen.getByTestId('toggle-notifications'), 'valueChange', false);

    await waitFor(() => {
      expect(saved).toContainEqual({
        notificationsEnabled: false,
        aiRefineEnabled: true,
        coachEnabled: false,
        analyticsEnabled: true,
        cardThemeId: 'midnight',
        coverageNudgeLastShownAt: null,
      });
    });
  });

  // Guideline 5.1.2(i): the toggle that sends data to an AI names who gets it.
  it('names OpenAI on the Coach toggle', () => {
    render(<SettingsView />);
    expect(screen.getByText(/to OpenAI/)).toBeTruthy();
  });

  it('links to How scoring works', () => {
    const onOpenScoring = jest.fn();
    render(<SettingsView onOpenScoring={onOpenScoring} />);
    fireEvent.press(screen.getByTestId('settings-scoring'));
    expect(onOpenScoring).toHaveBeenCalledTimes(1);
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
  });

  // An Apple private relay address is one the user has usually never seen.
  it('names Sign in with Apple instead of a relay address', () => {
    useAuthStore.setState({
      accountsAvailable: true,
      status: 'authenticated',
      email: 'x7k2@privaterelay.appleid.com',
    });
    render(<SettingsView />);

    expect(screen.getByText(/Signed in with Apple\./)).toBeTruthy();
    expect(screen.queryByText(/privaterelay/)).toBeNull();
  });

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

    expect(screen.getByText('Erase all data on this device')).toBeTruthy();
  });
});
