import { render, screen } from '@testing-library/react-native';

import { REFINE_ENABLED } from '@/constants/app';
import { useEntitlementStore } from '@/store/entitlementStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { FREE_ENTITLEMENT } from '@/types';

import { SettingsView } from './SettingsView';

// No mock of '@/constants/app' here on purpose — see the companion
// SettingsView.test.tsx. This asserts what a released build shows.

beforeEach(() => {
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  useEntitlementStore.setState({
    entitlement: FREE_ENTITLEMENT,
    isPlus: false,
    hydrated: true,
  });
  useSettingsStore.setState({ aiRefineEnabled: true });
});

afterEach(() => {
  __setPersistenceForTests(null);
});

describe('SettingsView with refine cut from the release', () => {
  it('hides the AI Refine row even when the stored preference is on', () => {
    expect(REFINE_ENABLED).toBe(false);
    render(<SettingsView />);
    expect(screen.queryByTestId('toggle-ai-refine')).toBeNull();
  });

  it('leaves the stored preference untouched, so the cut is reversible', () => {
    render(<SettingsView />);
    expect(useSettingsStore.getState().aiRefineEnabled).toBe(true);
  });

  it('still renders the toggles that are part of the release', () => {
    render(<SettingsView />);
    expect(screen.getByTestId('toggle-notifications')).toBeTruthy();
    expect(screen.getByTestId('toggle-coach')).toBeTruthy();
  });
});
