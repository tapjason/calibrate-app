import { render, screen } from '@testing-library/react-native';

import { useEntitlementStore } from '@/store/entitlementStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { FREE_ENTITLEMENT } from '@/types';

import { SettingsView } from './SettingsView';

// The owner's removals of 2026-11-25: "Hide the words" (D61), "Show the words
// in reminders" (D60 (b)) and the daily practice reminder (step 89) are gone
// from You. A phone whose stored record still has any of them on shows none.

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));

beforeEach(() => {
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  useEntitlementStore.setState({ entitlement: FREE_ENTITLEMENT, isPlus: false, hydrated: true });
  useSettingsStore.setState({ notificationsEnabled: true, remindersEnabled: true, digestEnabled: true });
});

afterEach(() => {
  __setPersistenceForTests(null);
  jest.clearAllMocks();
});

describe('SettingsView — the removed rows (2026-11-25)', () => {
  it('has no Hide the words switch', () => {
    render(<SettingsView />);
    expect(screen.queryByTestId('toggle-hide-titles-row')).toBeNull();
    expect(screen.queryByText('Hide the words')).toBeNull();
    // Its neighbours stay: the streak switch and the notification rows.
    expect(screen.getByTestId('toggle-streak-row')).toBeTruthy();
  });

  it('has no switch for the words in reminders, and no practice or trivia reminder', () => {
    render(<SettingsView />);
    expect(screen.getByTestId('toggle-reminders-row')).toBeTruthy();
    expect(screen.queryByTestId('toggle-reminder-words-row')).toBeNull();
    expect(screen.queryByTestId('settings-practice-reminder')).toBeNull();
    expect(screen.queryByText(/practice reminder|trivia reminder/i)).toBeNull();
  });

  it('shows none of them for a record an older build stored with them on', async () => {
    __setPersistenceForTests({
      load: async () => ({
        notificationsEnabled: true,
        remindersEnabled: true,
        hideTitles: true,
        reminderWords: true,
        practiceReminder: { hour: 8, minute: 0 },
      } as never),
      save: async () => {},
    });
    await useSettingsStore.getState().hydrate();
    render(<SettingsView />);
    expect(screen.queryByTestId('toggle-hide-titles-row')).toBeNull();
    expect(screen.queryByTestId('toggle-reminder-words-row')).toBeNull();
    expect(screen.queryByTestId('settings-practice-reminder')).toBeNull();
  });
});
