import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import type { PlusPlan } from '@/billing/revenuecat';
import { PRIVACY_POLICY_URL } from '@/constants/app';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePaywallStore } from '@/store/paywallStore';
import { useSettingsStore } from '@/store/settingsStore';
import { FREE_ENTITLEMENT } from '@/types';

import { PaywallView } from './PaywallView';
import { noticeText } from './paywallCopy';

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
    expect(screen.getByText('$29.99\u00A0a\u00A0year after 1 month free')).toBeTruthy();
    expect(screen.getByText('$4.99\u00A0a\u00A0month')).toBeTruthy();
  });

  // Owner, TestFlight 2026-11-17: "The trial is not super clear from the
  // three options." DESIGN_SYSTEM \u00A77.6's "1 month free" badge, not "Best value".
  it('badges the plan with a trial, in place of its tagline', () => {
    seed();
    render(<PaywallView />);
    expect(screen.getByTestId('plan-annual-trial-badge')).toHaveTextContent('1 month free');
    expect(screen.queryByText('Best value')).toBeNull();
    // The others keep their taglines and get no badge.
    expect(screen.getByText('Month to month')).toBeTruthy();
    expect(screen.getByText('Pay once, keep it')).toBeTruthy();
    expect(screen.queryByTestId('plan-monthly-trial-badge')).toBeNull();
    expect(screen.queryByTestId('plan-lifetime-trial-badge')).toBeNull();
  });

  it('keeps "Best value" on annual when the store offers no trial', () => {
    seed({ plans: PLANS.map((p) => ({ ...p, trialDays: null, trialPeriod: null })) });
    render(<PaywallView />);
    expect(screen.getByText('Best value')).toBeTruthy();
    expect(screen.queryByTestId('plan-annual-trial-badge')).toBeNull();
    expect(screen.getByText('$29.99\u00A0a\u00A0year')).toBeTruthy();
  });

  it('says Monthly has no free trial while annual has one, and never on Lifetime', () => {
    seed();
    render(<PaywallView />);
    expect(screen.getByTestId('plan-monthly-no-trial')).toHaveTextContent('No free trial');
    expect(screen.queryByTestId('plan-lifetime-no-trial')).toBeNull();
    expect(screen.queryByTestId('plan-annual-no-trial')).toBeNull();
    expect(screen.getAllByText('No free trial')).toHaveLength(1);
  });

  it('says nothing about a trial when no plan on offer has one', () => {
    seed({ plans: PLANS.map((p) => ({ ...p, trialDays: null, trialPeriod: null })) });
    render(<PaywallView />);
    expect(screen.queryByText('No free trial')).toBeNull();
  });

  it('reads the badge and the price on the annual card to VoiceOver', () => {
    seed();
    render(<PaywallView />);
    const label: string = screen.getByTestId('plan-annual').props.accessibilityLabel;
    expect(label).toContain('1 month free');
    expect(label).toContain('$29.99\u00A0a\u00A0year after 1 month free');
    expect(label).not.toContain('Best value');
    expect(screen.getByTestId('plan-monthly').props.accessibilityLabel).toBe(
      'Monthly, $4.99\u00A0a\u00A0month. No free trial. Month to month',
    );
  });

  // Roadmap step 50: the monthly figure sits under annual's price, smaller,
  // and only when the store reports one. It shows "$2.50 / month" (owner,
  // 2026-11-21); the card's label, which VoiceOver reads in place of its
  // lines, keeps the sentence.
  it("shows annual's monthly equivalent under its price", () => {
    seed({
      plans: PLANS.map((p) =>
        p.plan === 'annual' ? { ...p, pricePerMonthString: '$2.50' } : p,
      ),
    });
    render(<PaywallView />);
    expect(screen.getByTestId('plan-annual-equivalent').props.children).toBe(
      '$2.50\u00A0/\u00A0month',
    );
    expect(screen.getByTestId('plan-annual').props.accessibilityLabel).toBe(
      'Annual, 1 month free. $29.99\u00A0a\u00A0year after 1 month free. Works out to $2.50 a month.',
    );
    expect(screen.queryByTestId('plan-monthly-equivalent')).toBeNull();
  });

  it('leaves the equivalent out when the store gives none', () => {
    seed();
    render(<PaywallView />);
    expect(screen.queryByTestId('plan-annual-equivalent')).toBeNull();
  });

  // Policy review 2026-11-25: the trial's line says it converts; the renewal
  // line under it carries the 24 hours, for every subscription plan.
  it('states that the trial converts, and the 24-hour cancel deadline', () => {
    seed();
    render(<PaywallView />);
    const terms = screen.getByTestId('paywall-trial-terms');
    expect(terms.props.children).toContain('turns into a paid subscription');
    expect(screen.getByText(/at least 24 hours before the end of the current period/)).toBeTruthy();
  });

  it('omits the trial terms when no plan on offer has a trial', () => {
    seed({ plans: PLANS.map((p) => ({ ...p, trialDays: null, trialPeriod: null })) });
    render(<PaywallView />);
    expect(screen.queryByTestId('paywall-trial-terms')).toBeNull();
  });

  // Blind playtest 2026-11-04, second round, run 4: Lifetime read "Your free
  // trial turns into a paid subscription" and "Subscriptions renew".
  it('states the terms of the plan chosen, not of every plan on offer', () => {
    seed();
    render(<PaywallView />);
    expect(screen.getByText(/renew automatically/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('plan-monthly'));
    expect(screen.queryByTestId('paywall-trial-terms')).toBeNull();
    // With no trial too, the 24 hours (policy review 2026-11-25).
    expect(screen.getByText(/renew automatically unless cancelled at least 24 hours/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('plan-lifetime'));
    expect(screen.queryByTestId('paywall-trial-terms')).toBeNull();
    expect(screen.queryByText(/renew automatically/)).toBeNull();
    expect(screen.getByText('One-time purchase. No subscription, no renewal.')).toBeTruthy();
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
    expect(screen.getByTestId('paywall-cta')).toHaveTextContent(/^Start 1 month free, then /);
    expect(screen.getAllByTestId('paywall-cta')).toHaveLength(1);
  });

  it('lays out the trial timeline only for a plan that has one', () => {
    seed();
    render(<PaywallView />);
    expect(screen.getByTestId('paywall-timeline')).toBeTruthy();
    fireEvent.press(screen.getByTestId('plan-monthly'));
    expect(screen.queryByTestId('paywall-timeline')).toBeNull();
  });

  // The timeline box said nothing about what it was (owner, TestFlight 2026-11-17).
  it('heads the timeline, and only while a trial plan is selected', () => {
    seed();
    render(<PaywallView />);
    expect(screen.getByTestId('paywall-timeline-heading')).toHaveTextContent(
      'How the free trial works',
    );
    fireEvent.press(screen.getByTestId('plan-monthly'));
    expect(screen.queryByText('How the free trial works')).toBeNull();
    fireEvent.press(screen.getByTestId('plan-lifetime'));
    expect(screen.queryByText('How the free trial works')).toBeNull();
    fireEvent.press(screen.getByTestId('plan-annual'));
    expect(screen.getByText('How the free trial works')).toBeTruthy();
  });

  // Roadmap D16 and the security review, 2026-11-18, round 4: the reminder
  // two days before is promised only while the app would send it, with the
  // Notifications switch on AND iOS permission granted. Unread (null),
  // denied or not asked: no promise.
  describe('the reminder step in the trial timeline', () => {
    const REMINDER = 'A notification with the date it renews and the price.';

    afterEach(() => {
      useSettingsStore.setState({ notificationsEnabled: true, notificationPermission: null });
    });

    it('shows with the switch on and permission granted', () => {
      seed();
      useSettingsStore.setState({ notificationsEnabled: true, notificationPermission: 'granted' });
      render(<PaywallView />);
      expect(screen.getByText('Two days before')).toBeTruthy();
      expect(screen.getByText(REMINDER)).toBeTruthy();
    });

    it.each([
      ['denied', 'denied'],
      ['not asked yet', 'undetermined'],
      ['not read yet', null],
    ] as const)('hides while permission is %s', (_label, permission) => {
      seed();
      useSettingsStore.setState({ notificationsEnabled: true, notificationPermission: permission });
      render(<PaywallView />);
      // The rest of the timeline stays.
      expect(screen.getByTestId('paywall-timeline')).toBeTruthy();
      expect(screen.queryByText('Two days before')).toBeNull();
      expect(screen.queryByText(REMINDER)).toBeNull();
      expect(screen.queryByText(/notification/i)).toBeNull();
    });

    it('hides with the switch off, even with permission granted', () => {
      seed();
      useSettingsStore.setState({ notificationsEnabled: false, notificationPermission: 'granted' });
      render(<PaywallView />);
      expect(screen.queryByText('Two days before')).toBeNull();
    });

    // A grant from the app's own ask, or one made in iOS Settings and read on
    // the return to the foreground, reaches an open paywall.
    it('follows the permission while the paywall is open', () => {
      seed();
      useSettingsStore.setState({ notificationsEnabled: true, notificationPermission: null });
      render(<PaywallView />);
      expect(screen.queryByText('Two days before')).toBeNull();

      act(() => useSettingsStore.getState().setNotificationPermission('granted'));
      expect(screen.getByText('Two days before')).toBeTruthy();

      act(() => useSettingsStore.getState().setNotificationPermission('denied'));
      expect(screen.queryByText('Two days before')).toBeNull();
    });
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

  // Blind playtest 2026-11-10, run 4: with billing but no connection, the
  // screen said the build had no Plus.
  it('says the plans need a connection when billing exists but they did not load', () => {
    seed({ plans: [] });
    render(<PaywallView />);
    expect(screen.getByTestId('paywall-unavailable')).toHaveTextContent(
      "Plus plans couldn't load. Check your connection, then open this again.",
    );
  });

  it('keeps "this build" for a build with no billing', () => {
    seed({ plans: [] });
    usePaywallStore.setState({ available: false });
    render(<PaywallView />);
    expect(screen.getByTestId('paywall-unavailable')).toHaveTextContent(
      "Plus isn't available on this build yet.",
    );
  });

  it('shows a spinner while the offering loads', () => {
    seed({ plans: [], loadingPlans: true });
    render(<PaywallView />);
    expect(screen.getByTestId('paywall-loading')).toBeTruthy();
    expect(screen.queryByTestId('paywall-unavailable')).toBeNull();
  });

  // The notice is set after the screen opens: one already there when it
  // opens is from an earlier visit, and is cleared (review round 2, item 2).
  it('surfaces the outcome notice', () => {
    seed();
    render(<PaywallView />);
    act(() => usePaywallStore.setState({ notice: 'failed' }));
    expect(screen.getByTestId('paywall-notice').props.children).toMatch(
      /[Nn]othing was charged/,
    );
  });

  // Review round 1, item 1: Apple charged, but the account on the phone
  // changed while the purchase finished, so it went to the other account.
  it('says where a purchase went when the account changed while it finished, in the same place', () => {
    seed();
    render(<PaywallView />);
    act(() => usePaywallStore.setState({ notice: 'purchased_elsewhere' }));
    expect(screen.getByTestId('paywall-notice').props.children).toBe(
      'Your purchase went through, but the account on this phone changed while it finished. ' +
        "Sign in to the account you were using to get Plus. If it doesn't show, tap Restore purchases.",
    );
    // Nothing is Plus on this account, so the offer stays.
    expect(screen.getByTestId('paywall')).toBeTruthy();
    expect(screen.queryByTestId('paywall-active')).toBeNull();
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

  // Roadmap step 30: "Not now" sits below the fold on a phone, so the way out
  // is also at the top, where people look for it.
  it('offers a labelled close control at the top too', () => {
    seed();
    const onClose = jest.fn();
    render(<PaywallView onClose={onClose} />);
    const close = screen.getByTestId('paywall-dismiss');
    expect(close.props.accessibilityLabel).toBe('Close');
    fireEvent.press(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('names what Trends now includes', () => {
    seed();
    render(<PaywallView />);
    expect(screen.getByText(/what your 80% really means/)).toBeTruthy();
    // Without a way to close, there is nothing to draw at the top either.
    expect(screen.queryByTestId('paywall-dismiss')).toBeNull();
  });

  // The title keeps clear of the × (step 70), and only when the × is there.
  it('narrows the title for the close control only when it shows', () => {
    seed();
    const marginOf = () =>
      StyleSheet.flatten(screen.getByText('Fairly Sure Plus').props.style).marginRight;
    const { rerender } = render(<PaywallView />);
    expect(marginOf()).toBeUndefined();
    rerender(<PaywallView onClose={jest.fn()} />);
    expect(marginOf()).toBeGreaterThan(0);
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

  // Guideline 3.1.2: the purchase screen links the hosted policy, not only the terms.
  it('links the hosted privacy policy', () => {
    const { openBrowserAsync } = jest.requireMock('expo-web-browser');
    seed();
    render(<PaywallView />);
    expect(PRIVACY_POLICY_URL).toBe('https://tapjason.github.io/calibrate-app/privacy/');
    fireEvent.press(screen.getByTestId('paywall-privacy-link'));
    expect(openBrowserAsync).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
  });
});

// The route waits for RevenueCat to start before the plans are asked for
// (roadmap D70, `ensureBillingStarted`); meanwhile the screen shows its
// loading state.
describe('PaywallView — before billing has started', () => {
  it('asks for no plans and shows the loading state, with nothing to press', async () => {
    const { loadPlans, restore } = seed({ plans: [] });
    render(<PaywallView billingReady={false} />);
    await act(async () => {});

    expect(loadPlans).not.toHaveBeenCalled();
    expect(screen.getByTestId('paywall-loading')).toBeTruthy();
    expect(screen.queryByTestId('paywall-unavailable')).toBeNull();
    expect(screen.getByTestId('paywall-restore').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByTestId('paywall-restore'));
    expect(restore).not.toHaveBeenCalled();
  });

  it('asks for the plans once billing has started', async () => {
    const { loadPlans } = seed({ plans: [] });
    const { rerender } = render(<PaywallView billingReady={false} />);
    await act(async () => {});
    expect(loadPlans).not.toHaveBeenCalled();

    rerender(<PaywallView billingReady />);
    await waitFor(() => expect(loadPlans).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('paywall-loading')).toBeNull();
    // No plans came back: today's line for that.
    expect(screen.getByTestId('paywall-unavailable')).toBeTruthy();
  });
});

// Review round 2, item 1: the notice under the button was shown and never
// said, so VoiceOver heard nothing after a purchase, a restore or a failure.
describe('PaywallView — the notice is said aloud', () => {
  let spy: jest.SpyInstance;
  // The preset's AccessibilityInfo is already a mock, so the spy is that mock
  // and keeps earlier tests' calls: cleared here, for each test.
  const spyAnnounce = () => {
    spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    spy.mockClear();
    return spy;
  };
  afterEach(() => spy?.mockRestore());

  it.each([
    'purchased',
    'purchased_elsewhere',
    'restored',
    'nothing_to_restore',
    'unavailable',
    'failed',
  ] as const)('says "%s" once when it appears, in the words shown', (notice) => {
    seed();
    const announce = spyAnnounce();
    render(<PaywallView />);
    expect(announce).not.toHaveBeenCalled();

    act(() => usePaywallStore.setState({ notice }));
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(noticeText(notice));
  });

  it('says it once for one change, not again on a re-render', () => {
    seed();
    const announce = spyAnnounce();
    render(<PaywallView />);
    act(() => usePaywallStore.setState({ notice: 'failed' }));
    // Another plan chosen: the screen draws again, the notice unchanged.
    fireEvent.press(screen.getByTestId('plan-monthly'));
    fireEvent.press(screen.getByTestId('plan-annual'));
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('says each new outcome, and nothing when the notice clears', () => {
    seed();
    const announce = spyAnnounce();
    render(<PaywallView />);
    act(() => usePaywallStore.setState({ notice: 'failed' }));
    // A second try clears it, then fails again.
    act(() => usePaywallStore.setState({ notice: null }));
    expect(announce).toHaveBeenCalledTimes(1);
    act(() => usePaywallStore.setState({ notice: 'failed' }));
    act(() => usePaywallStore.setState({ notice: 'restored' }));
    expect(announce.mock.calls).toEqual([
      [noticeText('failed')],
      [noticeText('failed')],
      [noticeText('restored')],
    ]);
  });

  it('says nothing for a notice already there when the screen opens', () => {
    seed({ notice: 'purchased_elsewhere' });
    const announce = spyAnnounce();
    render(<PaywallView />);
    expect(announce).not.toHaveBeenCalled();
  });
});

// Review round 2, item 2: a notice was cleared only by the next purchase or
// restore, so a later open in the same run still said "Your purchase went
// through…" about a visit long gone.
describe('PaywallView — a notice belongs to the visit it came on', () => {
  it('clears a notice left from an earlier visit when it opens, before anything is drawn', () => {
    seed({ notice: 'purchased_elsewhere' });
    render(<PaywallView />);
    expect(screen.queryByTestId('paywall-notice')).toBeNull();
    expect(usePaywallStore.getState().notice).toBeNull();
  });

  it('clears it while billing is still starting, too', () => {
    seed({ notice: 'restored', plans: [] });
    render(<PaywallView billingReady={false} />);
    expect(screen.queryByTestId('paywall-notice')).toBeNull();
  });

  it('keeps a notice that arrives during the visit, through billing starting and the plans loading', async () => {
    seed({ plans: [] });
    // A purchase started on an earlier visit, still in flight.
    usePaywallStore.setState({ purchasing: 'pkg_annual' });
    const { rerender } = render(<PaywallView billingReady={false} />);

    act(() => usePaywallStore.setState({ purchasing: null, notice: 'purchased_elsewhere' }));
    rerender(<PaywallView billingReady />);
    act(() => usePaywallStore.setState({ plans: PLANS }));
    await act(async () => {});

    expect(screen.getByTestId('paywall-notice').props.children).toBe(
      noticeText('purchased_elsewhere'),
    );
  });

  it('clears it again on the next open', () => {
    seed();
    const first = render(<PaywallView />);
    act(() => usePaywallStore.setState({ notice: 'restored' }));
    expect(screen.getByTestId('paywall-notice')).toBeTruthy();
    first.unmount();

    render(<PaywallView />);
    expect(screen.queryByTestId('paywall-notice')).toBeNull();
  });
});
