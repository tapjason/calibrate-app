import { act, fireEvent, render, screen } from '@testing-library/react-native';

import {
  LOCAL_ONLY_FROZEN_FOOTER,
  LOCAL_ONLY_GUEST_FOOTER,
  LOCAL_ONLY_GUEST_ROW,
  LOCAL_ONLY_GUEST_WHERE,
} from '@/components/age/localOnlyCopy';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { __setPersistenceForTests } from '@/store/settingsStore';
import { FREE_ENTITLEMENT } from '@/types';

import { SettingsView } from './SettingsView';

// You under the under-13 rule (roadmap D70; docs/design/research/
// under-13-2026-11.md, "Screens"): the account group explains, the Plus row,
// Coach (AI) and Usage stats go, and everything else stays, Export included.

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));

const PLUS = { is_plus: true, source: 'annual' as const, expires_at: null };

/** Every way out of You, as the tab passes them. */
function renderYou() {
  const handlers = {
    onOpenCard: jest.fn(),
    onOpenPaywall: jest.fn(),
    onOpenAccount: jest.fn(),
    onOpenDelete: jest.fn(),
    onOpenScoring: jest.fn(),
    onOpenCategories: jest.fn(),
  };
  render(<SettingsView {...handlers} />);
  return handlers;
}

function guest(accountsAvailable = true) {
  useAuthStore.setState({ accountsAvailable, status: 'guest', userId: 'local-user-v1', email: null });
}

function signedIn() {
  useAuthStore.setState({
    accountsAvailable: true,
    status: 'authenticated',
    userId: 'user-1',
    email: 'a@b.co',
    pending: false,
    signOut: jest.fn(async () => ({ ok: true as const })),
  });
}

beforeEach(() => {
  __setPersistenceForTests({ load: async () => null, save: async () => {} });
  useEntitlementStore.setState({ entitlement: FREE_ENTITLEMENT, isPlus: false, hydrated: true });
});

afterEach(() => {
  __setPersistenceForTests(null);
  act(() => __resetAgeStoreForTests());
});

describe('You under the under-13 rule', () => {
  describe('a guest', () => {
    it.each([
      ['on a build with accounts', true],
      ['on a build without them', false],
    ])('explains why everything stays on this phone, %s, with no way to sign in', (_label, accounts) => {
      guest(accounts);
      useAgeStore.setState({ localOnly: true });
      const { onOpenAccount } = renderYou();

      expect(screen.getByTestId('settings-local-only')).toHaveTextContent(LOCAL_ONLY_GUEST_ROW);
      expect(screen.getByText(LOCAL_ONLY_GUEST_FOOTER)).toBeTruthy();
      expect(screen.getByText(LOCAL_ONLY_GUEST_WHERE)).toBeTruthy();
      expect(screen.queryByTestId('settings-sign-in')).toBeNull();
      expect(screen.queryByText(/Not signed in/)).toBeNull();
      // The row is a statement, not a button.
      expect(screen.getByTestId('settings-local-only').props.accessibilityRole).toBeUndefined();
      fireEvent.press(screen.getByText(LOCAL_ONLY_GUEST_ROW));
      expect(onOpenAccount).not.toHaveBeenCalled();
    });

    it('drops the Plus row, Coach (AI) and Usage stats, and keeps everything else', () => {
      guest();
      useAgeStore.setState({ localOnly: true });
      renderYou();

      expect(screen.queryByTestId('settings-plus')).toBeNull();
      expect(screen.queryByText(/Plus adds Coach/)).toBeNull();
      expect(screen.queryByTestId('toggle-coach-row')).toBeNull();
      expect(screen.queryByTestId('toggle-analytics-row')).toBeNull();
      for (const id of [
        'settings-card',
        'settings-categories',
        'toggle-streak-row',
        'toggle-hide-titles-row',
        'toggle-notifications-row',
        'settings-export',
        'settings-scoring',
        'settings-terms-link',
        'settings-support-link',
        'settings-delete',
      ]) {
        expect(screen.getByTestId(id)).toBeTruthy();
      }
      // A guest's Erase stays.
      expect(screen.getByText('Erase your data on this phone')).toBeTruthy();
    });

    it('drops the Plus row and its line with a Plus mirror too', () => {
      guest();
      useEntitlementStore.setState({ entitlement: PLUS, isPlus: true, hydrated: true });
      useAgeStore.setState({ localOnly: true });
      renderYou();

      expect(screen.queryByTestId('settings-plus')).toBeNull();
      expect(screen.queryByText(/Coach and Trends are unlocked/)).toBeNull();
      expect(screen.getByTestId('settings-card')).toBeTruthy();
    });
  });

  describe('an account signed in before (frozen)', () => {
    it('keeps Sign out and Delete account, and says backup is off', () => {
      signedIn();
      useAgeStore.setState({ localOnly: true });
      const { onOpenDelete } = renderYou();

      expect(screen.getByText(`Signed in as a@b.co. ${LOCAL_ONLY_FROZEN_FOOTER}`)).toBeTruthy();
      expect(screen.queryByText(/Your predictions are backed up/)).toBeNull();
      expect(screen.queryByTestId('settings-local-only')).toBeNull();

      fireEvent.press(screen.getByTestId('settings-sign-out'));
      expect(useAuthStore.getState().signOut).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Delete account')).toBeTruthy();
      fireEvent.press(screen.getByTestId('settings-delete'));
      expect(onOpenDelete).toHaveBeenCalledTimes(1);

      expect(screen.queryByTestId('settings-plus')).toBeNull();
      expect(screen.queryByTestId('toggle-coach-row')).toBeNull();
      expect(screen.queryByTestId('toggle-analytics-row')).toBeNull();
      expect(screen.getByTestId('settings-export')).toBeTruthy();
    });
  });

  describe('without the rule', () => {
    it('is You as usual, for a guest and a signed-in account', () => {
      guest();
      const first = renderYou();
      expect(screen.getByTestId('settings-sign-in')).toBeTruthy();
      expect(screen.getByTestId('settings-plus')).toBeTruthy();
      expect(screen.getByTestId('toggle-coach-row')).toBeTruthy();
      expect(screen.getByTestId('toggle-analytics-row')).toBeTruthy();
      expect(screen.queryByTestId('settings-local-only')).toBeNull();
      fireEvent.press(screen.getByTestId('settings-plus'));
      expect(first.onOpenPaywall).toHaveBeenCalledTimes(1);
      screen.unmount();

      signedIn();
      renderYou();
      expect(screen.getByText(/Your predictions are backed up/)).toBeTruthy();
      expect(screen.queryByText(LOCAL_ONLY_FROZEN_FOOTER, { exact: false })).toBeNull();
    });
  });
});
