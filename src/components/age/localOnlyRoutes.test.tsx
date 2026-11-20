// The paywall and account routes (app/paywall.tsx, app/account/index.tsx)
// under the under-13 rule (roadmap D70; docs/design/research/
// under-13-2026-11.md, "Screens"). Both are reachable by deep link, so each
// route itself draws the local-only page and never mounts PaywallView or
// SignInView. Tested from here: a test file under app/ would be a route.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { track } from '@/analytics/track';
import { ensureBillingStarted } from '@/billing/init';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';

import AccountScreen from '../../../app/account/index';
import PaywallScreen from '../../../app/paywall';
import {
  LOCAL_ONLY_ACCOUNT_BODY,
  LOCAL_ONLY_ACCOUNT_TITLE,
  LOCAL_ONLY_FROZEN_ACCOUNT_TITLE,
  LOCAL_ONLY_FROZEN_FOOTER,
  LOCAL_ONLY_PAYWALL_BODY,
  LOCAL_ONLY_PAYWALL_MANAGE,
  LOCAL_ONLY_PAYWALL_TITLE,
} from './localOnlyCopy';

const mockRouter = {
  back: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ from: 'stats' }),
}));
// The paywall insets its own top edge from the window's insets; no provider here.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/analytics/track', () => ({ track: jest.fn(async () => {}) }));
jest.mock('@/billing/init', () => ({ ensureBillingStarted: jest.fn(async () => true) }));

// The two views stand in for themselves: what matters here is whether the
// route mounts them, and with what.
const mockPaywallMounts = jest.fn();
jest.mock('@/components/paywall/PaywallView', () => {
  const { createElement } = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    PaywallView: (props: { billingReady?: boolean; onClose?: () => void }) => {
      mockPaywallMounts(props);
      return createElement(Text, { testID: 'paywall-view' }, `ready:${String(props.billingReady)}`);
    },
  };
});
const mockSignInMounts = jest.fn();
jest.mock('@/components/account/SignInView', () => {
  const { createElement } = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    SignInView: (props: { onDone: () => void }) => {
      mockSignInMounts(props);
      return createElement(Text, { testID: 'sign-in-view' }, 'Sign in');
    },
  };
});

const ensure = ensureBillingStarted as jest.Mock;
const trackMock = track as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
  ensure.mockResolvedValue(true);
});

afterEach(() => act(() => __resetAgeStoreForTests()));

describe('the paywall route', () => {
  describe('under the rule', () => {
    beforeEach(() => useAgeStore.setState({ localOnly: true }));

    it('draws the local-only page and never mounts the paywall, starts billing or records a view', async () => {
      render(<PaywallScreen />);
      await act(async () => {});

      expect(screen.getByTestId('paywall-local-only')).toBeTruthy();
      expect(screen.getByText(LOCAL_ONLY_PAYWALL_TITLE)).toBeTruthy();
      expect(screen.getByText(LOCAL_ONLY_PAYWALL_BODY)).toBeTruthy();
      expect(screen.getByText(LOCAL_ONLY_PAYWALL_TITLE).props.accessibilityRole).toBe('header');
      expect(screen.queryByTestId('paywall-view')).toBeNull();
      expect(mockPaywallMounts).not.toHaveBeenCalled();
      expect(ensure).not.toHaveBeenCalled();
      expect(trackMock).not.toHaveBeenCalled();
    });

    it('says where an existing subscription is managed, between the body and Close, with no plans or purchase buttons', () => {
      render(<PaywallScreen />);
      expect(screen.getByText(LOCAL_ONLY_PAYWALL_MANAGE)).toBeTruthy();
      // Reading order: title, body, the line, Close (the page's text, in tree order).
      const order = screen
        .UNSAFE_getAllByType(Text)
        .map((n) => n.props.children)
        .filter((c): c is string => typeof c === 'string');
      const i = (s: string) => order.indexOf(s);
      expect(i(LOCAL_ONLY_PAYWALL_TITLE)).toBeGreaterThan(-1);
      expect(i(LOCAL_ONLY_PAYWALL_BODY)).toBeGreaterThan(i(LOCAL_ONLY_PAYWALL_TITLE));
      expect(i(LOCAL_ONLY_PAYWALL_MANAGE)).toBeGreaterThan(i(LOCAL_ONLY_PAYWALL_BODY));
      expect(i('Close')).toBeGreaterThan(i(LOCAL_ONLY_PAYWALL_MANAGE));
      // Plain text: nothing to press but the two ways out.
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.queryByTestId('paywall-view')).toBeNull();
      expect(screen.queryByTestId('purchase-button')).toBeNull();
      expect(screen.queryByText(/restore/i)).toBeNull();
    });

    it('closes from Close and from the ×, back where it came from', () => {
      render(<PaywallScreen />);
      fireEvent.press(screen.getByTestId('paywall-local-only-close'));
      fireEvent.press(screen.getByTestId('paywall-local-only-dismiss'));
      expect(mockRouter.back).toHaveBeenCalledTimes(2);
    });

    it('closes to Insights from a cold deep link', () => {
      mockRouter.canGoBack.mockReturnValue(false);
      render(<PaywallScreen />);
      fireEvent.press(screen.getByTestId('paywall-local-only-close'));
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/insights');
    });
  });

  describe('without the rule', () => {
    it('waits for billing to start before the plans load, showing the paywall loading meanwhile', async () => {
      let started: (value: boolean) => void = () => {};
      ensure.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            started = resolve;
          }),
      );
      render(<PaywallScreen />);

      expect(ensure).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('paywall-view')).toHaveTextContent('ready:false');
      await act(async () => started(true));
      expect(screen.getByTestId('paywall-view')).toHaveTextContent('ready:true');
      expect(trackMock).toHaveBeenCalledWith('paywall_viewed', { source: 'stats' });
      expect(screen.queryByTestId('paywall-local-only')).toBeNull();
    });

    // No SDK or key: billing doesn't start, and the paywall says why there
    // are no plans, as today.
    it('opens the paywall when billing can’t start', async () => {
      ensure.mockResolvedValue(false);
      render(<PaywallScreen />);
      await waitFor(() => expect(screen.getByTestId('paywall-view')).toHaveTextContent('ready:true'));
    });

    it('takes the paywall away at once when a band turns the rule on while it is open', async () => {
      render(<PaywallScreen />);
      await waitFor(() => expect(screen.getByTestId('paywall-view')).toHaveTextContent('ready:true'));

      act(() => useAgeStore.setState({ localOnly: true }));
      expect(screen.queryByTestId('paywall-view')).toBeNull();
      expect(screen.getByTestId('paywall-local-only')).toBeTruthy();
    });
  });
});

describe('the account route', () => {
  // A guest unless a test signs in.
  beforeEach(() => useAuthStore.setState({ status: 'guest', userId: 'local-user-v1', email: null }));
  afterEach(() => act(() => useAuthStore.setState({ status: 'loading', userId: null, email: null })));

  it('draws the local-only page under the rule and never mounts the sign-in view', () => {
    useAgeStore.setState({ localOnly: true });
    render(<AccountScreen />);

    expect(screen.getByTestId('account-local-only')).toBeTruthy();
    expect(screen.getByText(LOCAL_ONLY_ACCOUNT_TITLE)).toBeTruthy();
    expect(screen.getByText(LOCAL_ONLY_ACCOUNT_TITLE).props.accessibilityRole).toBe('header');
    expect(screen.getByText(LOCAL_ONLY_ACCOUNT_BODY)).toBeTruthy();
    expect(screen.queryByText(LOCAL_ONLY_FROZEN_ACCOUNT_TITLE)).toBeNull();
    expect(screen.queryByText(LOCAL_ONLY_FROZEN_FOOTER)).toBeNull();
    expect(screen.queryByTestId('sign-in-view')).toBeNull();
    expect(mockSignInMounts).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('account-local-only-close'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  // Review 2026-11-19: an account signed in before the rule came on is
  // frozen, not gone, so "No account on this phone" would be untrue. Only a
  // deep link reaches this route then (You shows Sign out, not Sign in).
  it('tells a frozen account that backup is off, in You’s words, and never mounts the sign-in view', () => {
    useAuthStore.setState({ status: 'authenticated', userId: 'user-1', email: 'a@b.co' });
    useAgeStore.setState({ localOnly: true });
    render(<AccountScreen />);

    expect(screen.getByTestId('account-local-only')).toBeTruthy();
    expect(screen.getByText('Backup is off on this phone')).toBeTruthy();
    expect(screen.getByText(LOCAL_ONLY_FROZEN_ACCOUNT_TITLE).props.accessibilityRole).toBe('header');
    expect(screen.getByText(LOCAL_ONLY_FROZEN_FOOTER)).toBeTruthy();
    expect(screen.queryByText(LOCAL_ONLY_ACCOUNT_TITLE)).toBeNull();
    expect(screen.queryByText(LOCAL_ONLY_ACCOUNT_BODY)).toBeNull();
    expect(screen.queryByTestId('sign-in-view')).toBeNull();
    expect(mockSignInMounts).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('account-local-only-close'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('follows the account: signed out while open, the guest page', () => {
    useAuthStore.setState({ status: 'authenticated', userId: 'user-1', email: 'a@b.co' });
    useAgeStore.setState({ localOnly: true });
    render(<AccountScreen />);
    expect(screen.getByText(LOCAL_ONLY_FROZEN_ACCOUNT_TITLE)).toBeTruthy();

    act(() => useAuthStore.setState({ status: 'guest', userId: 'local-user-v1', email: null }));
    expect(screen.getByText(LOCAL_ONLY_ACCOUNT_TITLE)).toBeTruthy();
    expect(screen.queryByText(LOCAL_ONLY_FROZEN_ACCOUNT_TITLE)).toBeNull();
  });

  it('is the sign-in screen for a signed-in account without the rule', () => {
    useAuthStore.setState({ status: 'authenticated', userId: 'user-1', email: 'a@b.co' });
    render(<AccountScreen />);
    expect(screen.getByTestId('sign-in-view')).toBeTruthy();
    expect(screen.queryByTestId('account-local-only')).toBeNull();
  });

  it('closes to You from a cold deep link under the rule', () => {
    useAgeStore.setState({ localOnly: true });
    mockRouter.canGoBack.mockReturnValue(false);
    render(<AccountScreen />);
    fireEvent.press(screen.getByTestId('account-local-only-dismiss'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/you');
  });

  it('is the sign-in screen without the rule', () => {
    render(<AccountScreen />);
    expect(screen.getByTestId('sign-in-view')).toBeTruthy();
    expect(screen.getByTestId('account-close')).toBeTruthy();
    expect(screen.queryByTestId('account-local-only')).toBeNull();
  });

  it('takes the form away at once when a band turns the rule on while it is open', () => {
    render(<AccountScreen />);
    expect(screen.getByTestId('sign-in-view')).toBeTruthy();

    act(() => useAgeStore.setState({ localOnly: true }));
    expect(screen.queryByTestId('sign-in-view')).toBeNull();
    expect(screen.getByTestId('account-local-only')).toBeTruthy();
  });
});
