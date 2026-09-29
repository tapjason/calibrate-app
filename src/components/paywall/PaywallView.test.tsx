import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { PlusPlan } from '@/billing/revenuecat';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePaywallStore } from '@/store/paywallStore';
import { FREE_ENTITLEMENT } from '@/types';

import { PaywallView } from './PaywallView';

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));

// The shipped offering: one calendar month free on annual only — a user is
// eligible for an introductory offer once per subscription group, so putting
// it on the anchored plan is the point (GROWTH_AND_MONETIZATION.md §4).
const PLANS: PlusPlan[] = [
  {
    packageId: 'pkg_annual',
    plan: 'annual',
    priceString: '$29.99',
    trialDays: 30,
    trialPeriod: { count: 1, unit: 'MONTH' },
  },
  {
    packageId: 'pkg_monthly',
    plan: 'monthly',
    priceString: '$4.99',
    trialDays: null,
    trialPeriod: null,
  },
  {
    packageId: 'pkg_lifetime',
    plan: 'lifetime',
    priceString: '$59.99',
    trialDays: null,
    trialPeriod: null,
  },
];

// The store's own actions are covered in paywallStore.test.ts; here they are
// stubbed so the component is tested for what it renders and what it calls.
function seed({
  isPlus = false,
  plans = PLANS,
  loadingPlans = false,
  notice = null as ReturnType<typeof usePaywallStore.getState>['notice'],
}: {
  isPlus?: boolean;
  plans?: PlusPlan[];
  loadingPlans?: boolean;
  notice?: ReturnType<typeof usePaywallStore.getState>['notice'];
} = {}) {
  const purchase = jest.fn(async () => true);
  const restore = jest.fn(async () => true);
  const loadPlans = jest.fn(async () => {});

  useEntitlementStore.setState({
    entitlement: isPlus
      ? { is_plus: true, source: 'annual', expires_at: null }
      : FREE_ENTITLEMENT,
    isPlus,
    hydrated: true,
  });
  usePaywallStore.setState({
    plans,
    loadingPlans,
    purchasing: null,
    restoring: false,
    notice,
    available: true,
    purchase,
    restore,
    loadPlans,
  });
  return { purchase, restore, loadPlans };
}

afterEach(() => {
  usePaywallStore.getState().reset();
});

describe('PaywallView', () => {
  it('loads the offering on mount', async () => {
    const { loadPlans } = seed();
    render(<PaywallView />);
    await waitFor(() => expect(loadPlans).toHaveBeenCalled());
  });

  it('shows annual first, with its trial', () => {
    seed();
    render(<PaywallView />);
    expect(screen.getByTestId('plan-annual')).toBeTruthy();
    expect(screen.getByText('1 month free, then $29.99')).toBeTruthy();
    expect(screen.getByText('$4.99')).toBeTruthy();
  });

  it('states that the trial converts, and the 24-hour cancel deadline', () => {
    seed();
    render(<PaywallView />);
    const terms = screen.getByTestId('paywall-trial-terms');
    expect(terms).toBeTruthy();
    expect(terms.props.children).toContain('24 hours');
  });

  it('omits the trial terms when no plan on offer has a trial', () => {
    seed({ plans: PLANS.map((p) => ({ ...p, trialDays: null, trialPeriod: null })) });
    render(<PaywallView />);
    expect(screen.queryByTestId('paywall-trial-terms')).toBeNull();
  });

  it('buys the plan that was selected, through the one button', async () => {
    const { purchase } = seed();
    render(<PaywallView />);
    fireEvent.press(screen.getByTestId('plan-monthly'));
    expect(screen.getByTestId('paywall-cta')).toHaveTextContent('Subscribe for $4.99 a month');
    fireEvent.press(screen.getByTestId('paywall-cta'));
    await waitFor(() => expect(purchase).toHaveBeenCalledWith('pkg_monthly'));
  });

  // DESIGN_SYSTEM §7.6: annual first and preselected, one CTA, honest timeline.
  it('preselects annual and offers its trial on the one button', () => {
    seed();
    render(<PaywallView />);
    expect(screen.getByTestId('plan-annual').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('paywall-cta')).toHaveTextContent('Start 1 month free');
    expect(screen.getAllByTestId('paywall-cta')).toHaveLength(1);
  });

  it('lays out the trial timeline only for a plan that has one', () => {
    seed();
    render(<PaywallView />);
    expect(screen.getByTestId('paywall-timeline')).toBeTruthy();
    fireEvent.press(screen.getByTestId('plan-monthly'));
    expect(screen.queryByTestId('paywall-timeline')).toBeNull();
  });

  it('puts the plans in annual, monthly, lifetime order whatever the store sends', () => {
    seed({ plans: [...PLANS].reverse() });
    render(<PaywallView />);
    const ids = screen.getAllByRole('radio').map((r) => r.props.testID);
    expect(ids).toEqual(['plan-annual', 'plan-monthly', 'plan-lifetime']);
  });

  it('restores purchases', async () => {
    const { restore } = seed();
    render(<PaywallView />);
    fireEvent.press(screen.getByTestId('paywall-restore'));
    await waitFor(() => expect(restore).toHaveBeenCalled());
  });

  // The generous free tier is the marketing budget (CLAUDE.md). A user who
  // reads this screen and comes away thinking the core loop is about to be
  // capped is the exact failure the note exists to prevent.
  it('states on the paywall itself what stays free', () => {
    seed();
    render(<PaywallView />);
    const note = screen.getByTestId('paywall-free-note');
    expect(note).toBeTruthy();
    expect(note.props.children).toMatch(/free forever/);
  });

  it('renders the unavailable state instead of an empty plan list', () => {
    seed({ plans: [] });
    render(<PaywallView />);
    expect(screen.getByTestId('paywall-unavailable')).toBeTruthy();
  });

  it('shows a spinner while the offering loads', () => {
    seed({ plans: [], loadingPlans: true });
    render(<PaywallView />);
    expect(screen.getByTestId('paywall-loading')).toBeTruthy();
    expect(screen.queryByTestId('paywall-unavailable')).toBeNull();
  });

  it('surfaces the outcome notice', () => {
    seed({ notice: 'failed' });
    render(<PaywallView />);
    expect(screen.getByTestId('paywall-notice').props.children).toMatch(
      /[Nn]othing was charged/,
    );
  });

  it('shows the subscriber state instead of the offer to an existing Plus user', () => {
    seed({ isPlus: true });
    render(<PaywallView />);
    expect(screen.getByTestId('paywall-active')).toBeTruthy();
    expect(screen.queryByTestId('plan-annual')).toBeNull();
  });

  it('calls onClose from the dismiss button', () => {
    seed();
    const onClose = jest.fn();
    render(<PaywallView onClose={onClose} />);
    fireEvent.press(screen.getByTestId('paywall-close'));
    expect(onClose).toHaveBeenCalled();
  });

  // Guideline 3.1.2: the terms of use must be reachable from the purchase
  // screen itself, not only from the store listing.
  it('links to the terms of use', () => {
    const { openBrowserAsync } = jest.requireMock('expo-web-browser');
    seed();
    render(<PaywallView />);

    fireEvent.press(screen.getByTestId('paywall-terms-link'));
    expect(openBrowserAsync).toHaveBeenCalledWith(
      'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
    );
  });

  // A link that 404s is worse than none; it appears once the policy is hosted.
  it('omits the privacy link while no policy URL is configured', () => {
    seed();
    render(<PaywallView />);
    expect(screen.queryByTestId('paywall-privacy-link')).toBeNull();
  });
});
