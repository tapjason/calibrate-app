import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { choosePracticeReminder } from '@/notifications/practiceReminder';
import { useEntitlementStore } from '@/store/entitlementStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { FREE_ENTITLEMENT } from '@/types';

import { SettingsView } from './SettingsView';

// The service decides permission and scheduling (its own tests cover both);
// here, only that the row hands it the moment and shows the choice.
jest.mock('@/notifications/practiceReminder', () => {
  const actual = jest.requireActual('@/notifications/practiceReminder');
  return {
    ...actual,
    choosePracticeReminder: jest.fn(async (time: unknown) => {
      const { useSettingsStore: store } = jest.requireActual('@/store/settingsStore');
      await store.getState().setPracticeReminder(time);
      return 'granted';
    }),
  };
});

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));

beforeEach(() => {
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  useEntitlementStore.setState({ entitlement: FREE_ENTITLEMENT, isPlus: false, hydrated: true });
});

afterEach(() => {
  __setPersistenceForTests(null);
  jest.clearAllMocks();
});

const selected = (id: string) =>
  screen.getByTestId(`settings-practice-moments-${id}`).props.accessibilityState?.selected;

describe('SettingsView — practice reminder (roadmap step 89)', () => {
  it('starts off, and offers moments in a day', () => {
    render(<SettingsView />);
    expect(selected('off')).toBe(true);
    expect(screen.getByTestId('settings-practice-moments-coffee').props.accessibilityLabel).toMatch(
      /^With coffee, 8:00\sAM$/,
    );
    expect(screen.getByText(/only on days practice isn.t done/)).toBeTruthy();
  });

  it('sets a moment, and turns it off again', async () => {
    render(<SettingsView />);
    fireEvent.press(screen.getByTestId('settings-practice-moments-dinner'));
    await waitFor(() => expect(selected('dinner')).toBe(true));
    // The chips wait while a choice is being saved (and iOS may be asking).
    await waitFor(() =>
      expect(screen.getByTestId('settings-practice-moments-off').props.accessibilityState?.disabled).toBe(false),
    );
    expect(choosePracticeReminder).toHaveBeenCalledWith({ hour: 20, minute: 30 });
    expect(useSettingsStore.getState().practiceReminder).toEqual({ hour: 20, minute: 30 });

    fireEvent.press(screen.getByTestId('settings-practice-moments-off'));
    await waitFor(() => expect(selected('off')).toBe(true));
    expect(choosePracticeReminder).toHaveBeenLastCalledWith(null);
  });

  it('says nothing is sent while Notifications is off', () => {
    useSettingsStore.setState({ notificationsEnabled: false, practiceReminder: { hour: 8, minute: 0 } });
    render(<SettingsView />);
    expect(selected('coffee')).toBe(true);
    expect(screen.getByText('Kept, but nothing is sent while Notifications is off.')).toBeTruthy();
  });
});
