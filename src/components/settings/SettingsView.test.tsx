import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useEntitlementStore } from '@/store/entitlementStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { FREE_ENTITLEMENT } from '@/types';

import { SettingsView } from './SettingsView';

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
      });
    });
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
