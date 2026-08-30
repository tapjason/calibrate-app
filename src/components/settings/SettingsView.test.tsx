import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';

import { SettingsView } from './SettingsView';

beforeEach(() => {
  // In-memory persistence so toggling doesn't touch native AsyncStorage.
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
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
      });
    });
  });
});
