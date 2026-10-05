import { fireEvent, render, screen } from '@testing-library/react-native';

import { useEntitlementStore } from '@/store/entitlementStore';
import { __setPersistenceForTests } from '@/store/settingsStore';
import { FREE_ENTITLEMENT } from '@/types';

import { SettingsView } from './SettingsView';

// Roadmap step 36, with the privacy policy hosted: the one constant that
// lights up the paywall's link lights up Settings' too.
jest.mock('@/constants/app', () => ({
  ...jest.requireActual('@/constants/app'),
  PRIVACY_POLICY_URL: 'https://example.github.io/calibrate/PRIVACY_POLICY',
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));

beforeEach(() => {
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  useEntitlementStore.setState({ entitlement: FREE_ENTITLEMENT, isPlus: false, hydrated: true });
});

afterEach(() => __setPersistenceForTests(null));

describe('SettingsView — legal links (Guideline 5.1.1(i))', () => {
  it('opens the privacy policy and the terms of use', () => {
    const { openBrowserAsync } = jest.requireMock('expo-web-browser');
    render(<SettingsView />);

    fireEvent.press(screen.getByTestId('settings-privacy-link'));
    expect(openBrowserAsync).toHaveBeenLastCalledWith(
      'https://example.github.io/calibrate/PRIVACY_POLICY',
    );

    fireEvent.press(screen.getByTestId('settings-terms-link'));
    expect(openBrowserAsync).toHaveBeenLastCalledWith(
      'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
    );
  });
});
