import { Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useEntitlementStore } from '@/store/entitlementStore';
import { __setPersistenceForTests } from '@/store/settingsStore';
import { FREE_ENTITLEMENT } from '@/types';

import { SettingsView } from './SettingsView';

const mockPermission = { current: 'undetermined' as string };
const mockAsk = jest.fn(async () => 'granted');

jest.mock('@/notifications/permission', () => ({
  reminderPermission: jest.fn(async () => mockPermission.current),
  askForReminders: () => mockAsk(),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));

beforeEach(() => {
  mockAsk.mockClear();
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  useEntitlementStore.setState({ entitlement: FREE_ENTITLEMENT, isPlus: false, hydrated: true });
});

afterEach(() => __setPersistenceForTests(null));

// Roadmap step 38: what the Notifications toggle can't say on its own.
describe('SettingsView — notification permission', () => {
  it('offers to ask iOS when it has not been asked, and hides once allowed', async () => {
    mockPermission.current = 'undetermined';
    render(<SettingsView />);
    const action = await screen.findByTestId('settings-notification-permission-action');
    expect(screen.getByText(/iOS hasn’t been asked yet/)).toBeTruthy();

    // Run the press's async chain (ask, then set state) to the end inside act.
    await act(async () => {
      fireEvent.press(action);
    });
    expect(screen.queryByTestId('settings-notification-permission')).toBeNull();
    expect(mockAsk).toHaveBeenCalledTimes(1);
  });

  it('points to iOS Settings after a refusal', async () => {
    mockPermission.current = 'denied';
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    render(<SettingsView />);
    fireEvent.press(await screen.findByTestId('settings-notification-permission-action'));
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(mockAsk).not.toHaveBeenCalled();
    openSettings.mockRestore();
  });

  it('says nothing once allowed, or on web', async () => {
    for (const state of ['granted', 'unsupported']) {
      mockPermission.current = state;
      const view = render(<SettingsView />);
      await waitFor(() => expect(screen.getByTestId('toggle-notifications')).toBeTruthy());
      expect(screen.queryByTestId('settings-notification-permission')).toBeNull();
      view.unmount();
    }
  });
});
