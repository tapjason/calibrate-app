import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { __setDeviceLocaleForTests } from '@/constants/locale';
import { useAuthStore } from '@/store/authStore';
import { useCategoryStore } from '@/store/categoryStore';
import { useCoachStore } from '@/store/coachStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { FREE_ENTITLEMENT, type CoachInsight, type UserStat } from '@/types';

import { CoachPanel } from './CoachPanel';

const USER_STAT: UserStat = {
  user_id: 'u1',
  calibration_rating: 72,
  total_predictions: 50,
  total_resolved: 40,
  current_streak: 2,
  rating_is_provisional: false,
};

const INSIGHT: CoachInsight = {
  type: 'overconfidence',
  category: 'finance',
  message: 'Your finance predictions run overconfident — 80% stated, 55% actual.',
  evidence: 80,
  suggestion: 'Try stating finance calls 15 points lower.',
};

function seed({
  isPlus = true,
  coachEnabled = true,
  signedIn = true,
}: { isPlus?: boolean; coachEnabled?: boolean; signedIn?: boolean } = {}): void {
  useAuthStore.setState(
    signedIn
      ? { userId: 'u1', email: 'u@example.com', status: 'authenticated' }
      : { userId: 'local-user-v1', email: null, status: 'guest' },
  );
  useEntitlementStore.setState({
    entitlement: isPlus
      ? { is_plus: true, source: 'annual', expires_at: null }
      : FREE_ENTITLEMENT,
    isPlus,
    hydrated: true,
  });
  useSettingsStore.setState({
    notificationsEnabled: true,
    aiRefineEnabled: true,
    coachEnabled,
    hydrated: true,
  });
  useStatsStore.setState({
    userStat: USER_STAT,
    categoryStats: [],
    calibration: { rating: 0, buckets: [] },
  });
  usePredictionStore.setState({ pending: [], resolved: [] });
  useCoachStore.setState({
    insights: [],
    crisisTopic: null,
    loading: false,
    lastAnsweredAt: null,
    lastRequestFailed: false,
    lastFailure: null,
    lastDroppedAll: false,
  });
}

afterEach(() => __setDeviceLocaleForTests(null));

describe('CoachPanel — gating', () => {
  it('shows an upsell and no ask button for a free user', () => {
    seed({ isPlus: false });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-upsell')).toBeTruthy();
    expect(screen.queryByTestId('coach-ask')).toBeNull();
  });

  it('points at Settings when Plus but Coach is off', () => {
    seed({ coachEnabled: false });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-disabled')).toBeTruthy();
    expect(screen.queryByTestId('coach-ask')).toBeNull();
  });

  // A guest can buy Plus on the device, but the Coach endpoint answers 401
  // without a session — asking would render "unavailable" to a paying user.
  it('asks a Plus guest to sign in instead of offering a request that must fail', () => {
    seed({ signedIn: false });
    const onSignIn = jest.fn();
    render(<CoachPanel onSignIn={onSignIn} />);

    expect(screen.getByTestId('coach-needs-account')).toBeTruthy();
    expect(screen.queryByTestId('coach-ask')).toBeNull();
    fireEvent.press(screen.getByTestId('coach-sign-in'));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('still shows a free guest the upsell, not a sign-in prompt', () => {
    seed({ isPlus: false, signedIn: false });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-upsell')).toBeTruthy();
    expect(screen.queryByTestId('coach-needs-account')).toBeNull();
  });

  it('offers the ask button when Plus and enabled', () => {
    seed();
    render(<CoachPanel />);
    expect(screen.getByTestId('coach-ask')).toBeTruthy();
  });

  // Guideline 5.1.2(i): the third-party AI service is disclosed before the first send.
  it('names a third-party AI service before the first request, and drops it once answered', () => {
    seed();
    const { unmount } = render(<CoachPanel />);
    const disclosure = screen.getByTestId('coach-disclosure').props.children;
    expect(disclosure).toMatch(/third-party AI service/);
    expect(disclosure).not.toMatch(/OpenAI/);
    unmount();

    useCoachStore.setState({ insights: [], lastAnsweredAt: '2026-08-29T12:00:00.000Z' });
    render(<CoachPanel />);
    expect(screen.queryByTestId('coach-disclosure')).toBeNull();
  });

  // §5.6 — the Coach must be clearly labeled as AI wherever it speaks.
  it('labels the surface as AI', () => {
    seed();
    render(<CoachPanel />);
    expect(screen.getByText('AI')).toBeTruthy();
  });
});

describe('CoachPanel — rendering insights', () => {
  it('renders a cached insight with its suggestion', () => {
    seed();
    useCoachStore.setState({
      insights: [INSIGHT],
      lastAnsweredAt: '2026-08-29T12:00:00.000Z',
    });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-insight-finance')).toBeTruthy();
    expect(screen.getByText(/run overconfident/)).toBeTruthy();
    expect(screen.getByText('Try stating finance calls 15 points lower.')).toBeTruthy();
  });

  it('leads with the receipt when the validator named the figure', () => {
    seed();
    useCoachStore.setState({
      insights: [
        {
          ...INSIGHT,
          evidence: 55,
          evidence_source: { field: 'actual_rate', scope: 'finance', value: 0.55 },
        },
      ],
      lastAnsweredAt: '2026-08-29T12:00:00.000Z',
    });
    render(<CoachPanel />);

    expect(screen.getByText('55%')).toBeTruthy();
    expect(screen.getByText('came true in finance')).toBeTruthy();
    expect(screen.getByTestId('coach-receipt').props.accessibilityLabel).toBe(
      '55%, came true in finance',
    );
  });

  // Security review, 2026-11-18: with the words hidden, a renamed built-in's
  // header read "Your own category" and its drift receipt named "health".
  it('names a drift by the same words as its header while the words are hidden', () => {
    seed();
    useCategoryStore.setState({
      defs: [
        {
          id: 'health',
          user_id: 'u1',
          name: 'Fitness',
          icon: null,
          hidden: false,
          position: 0,
          created_at: '2026-11-01T00:00:00.000Z',
        },
      ],
    });
    useSettingsStore.setState({ hideTitles: true });
    useCoachStore.setState({
      insights: [
        {
          ...INSIGHT,
          category: 'health',
          message: 'Your recent calls here sit closer to the line than your early ones.',
          evidence: 6,
          suggestion: 'Keep logging the same kinds of calls.',
          evidence_source: { field: 'pattern', scope: 'overall', value: 6, kind: 'drift_health' },
        },
      ],
      lastAnsweredAt: '2026-08-29T12:00:00.000Z',
    });
    try {
      render(<CoachPanel />);

      const card = screen.getByTestId('coach-insight-health');
      expect(card).toHaveTextContent(/Your own category/);
      expect(screen.getByTestId('coach-receipt').props.accessibilityLabel).toBe(
        '+6, change in your own category score, earlier to recent',
      );
      expect(card).not.toHaveTextContent(/health|Fitness/);
    } finally {
      useSettingsStore.setState({ hideTitles: false });
      useCategoryStore.setState({ defs: [] });
    }
  });

  it('leaves the receipt off when the figure is ambiguous', () => {
    seed();
    useCoachStore.setState({ insights: [INSIGHT], lastAnsweredAt: '2026-08-29T12:00:00.000Z' });
    render(<CoachPanel />);
    expect(screen.queryByTestId('coach-receipt')).toBeNull();
  });

  it('says so plainly when the Coach answered with nothing', () => {
    seed();
    useCoachStore.setState({ lastAnsweredAt: '2026-08-29T12:00:00.000Z' });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-nothing-to-say')).toBeTruthy();
  });

  // Item 12 (2026-11-19): past the overall gate, an answer whose insights
  // were all dropped told someone with 40 answers to keep logging. The store
  // keeps whether they were in `lastDroppedAll` (CoachResult.droppedAll),
  // set here as an answer leaves it.
  describe('when every insight the Coach wrote was dropped', () => {
    const NOTHING_BACKED =
      "Coach didn't find anything it could back with your numbers this time. Try again later.";
    function answeredWith(lastDroppedAll: boolean, totalResolved = USER_STAT.total_resolved) {
      seed();
      useStatsStore.setState({ userStat: { ...USER_STAT, total_resolved: totalResolved } });
      const state = { ...useCoachStore.getState(), lastAnsweredAt: '2026-08-29T12:00:00.000Z', lastDroppedAll };
      useCoachStore.setState(state);
    }
    afterEach(() => {
      // Back to the store's default for the tests after these.
      useCoachStore.setState({ lastDroppedAll: false });
    });

    it('says nothing could be backed, past the overall gate', () => {
      answeredWith(true);
      render(<CoachPanel />);
      expect(screen.getByTestId('coach-nothing-backed').props.children).toBe(NOTHING_BACKED);
      expect(screen.queryByTestId('coach-nothing-to-say')).toBeNull();
    });

    it('keeps "keep logging" below the overall gate', () => {
      answeredWith(true, 12);
      render(<CoachPanel />);
      expect(screen.getByTestId('coach-nothing-to-say')).toBeTruthy();
      expect(screen.queryByTestId('coach-nothing-backed')).toBeNull();
    });

    it('keeps "keep logging" when the Coach wrote none', () => {
      answeredWith(false);
      render(<CoachPanel />);
      expect(screen.getByTestId('coach-nothing-to-say')).toBeTruthy();
      expect(screen.queryByTestId('coach-nothing-backed')).toBeNull();
    });

    it('shows neither over a failure', () => {
      answeredWith(true);
      useCoachStore.setState({ lastRequestFailed: true });
      render(<CoachPanel />);
      expect(screen.queryByTestId('coach-nothing-backed')).toBeNull();
      expect(screen.queryByTestId('coach-nothing-to-say')).toBeNull();
      expect(screen.getByTestId('coach-unavailable')).toBeTruthy();
    });
  });

  it('distinguishes an outage from an empty answer', () => {
    seed();
    useCoachStore.setState({ lastRequestFailed: true });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('coach-nothing-to-say')).toBeNull();
  });

  // Step 189: a subscriber whose purchase hadn't reached the server got
  // "unavailable" from a Coach that was up and saying no.
  it('says the server could not confirm Plus on a 403, not that Coach is down', () => {
    seed();
    useCoachStore.setState({ lastRequestFailed: true, lastFailure: 'not_entitled' });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-not-confirmed').props.children).toBe(
      "Coach couldn't confirm your Plus subscription yet. Try again in a few minutes. " +
        'If it keeps happening, use Help and support in You.',
    );
    expect(screen.queryByTestId('coach-unavailable')).toBeNull();
    expect(screen.queryByTestId('coach-nothing-to-say')).toBeNull();
    // Get feedback is the way to try again.
    expect(screen.getByTestId('coach-ask').props.accessibilityState.disabled).toBe(false);
  });

  // Step 189: with no scored answer no request is made; it read "unavailable".
  it('says there is no scored answer yet, and keeps the disclosure', () => {
    seed();
    useCoachStore.setState({ lastRequestFailed: true, lastFailure: 'nothing_scored' });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-nothing-scored').props.children).toBe(
      "Coach reads your scored answers, and you don't have one yet. An answer counts " +
        'from the day after you logged the prediction.',
    );
    expect(screen.queryByTestId('coach-unavailable')).toBeNull();
    expect(screen.queryByTestId('coach-not-confirmed')).toBeNull();
    expect(screen.queryByTestId('coach-nothing-to-say')).toBeNull();
    expect(screen.getByTestId('coach-disclosure')).toBeTruthy();
    expect(screen.getByTestId('coach-ask').props.accessibilityState.disabled).toBe(false);
  });

  it('keeps "unavailable" for every other failure', () => {
    seed();
    useCoachStore.setState({ lastRequestFailed: true, lastFailure: null });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-unavailable').props.children).toBe(
      'Coach is unavailable right now.',
    );
    expect(screen.queryByTestId('coach-not-confirmed')).toBeNull();
    expect(screen.queryByTestId('coach-nothing-scored')).toBeNull();
  });

  it('shows neither once a later answer lands', () => {
    seed();
    useCoachStore.setState({
      lastRequestFailed: false,
      lastFailure: null,
      lastAnsweredAt: '2026-08-29T12:00:00.000Z',
    });
    render(<CoachPanel />);

    expect(screen.queryByTestId('coach-not-confirmed')).toBeNull();
    expect(screen.queryByTestId('coach-nothing-scored')).toBeNull();
    expect(screen.queryByTestId('coach-unavailable')).toBeNull();
  });

  it('disables the button while a request is in flight', () => {
    seed();
    useCoachStore.setState({ loading: true });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-ask').props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it('asks the store for insights on press', async () => {
    seed();
    const calls: unknown[] = [];
    useCoachStore.setState({
      requestInsights: async (request) => {
        calls.push(request);
      },
    });

    render(<CoachPanel />);
    fireEvent.press(screen.getByTestId('coach-ask'));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ isPlus: true, enabled: true });
  });
});

// §5.5 — the support surface replaces coaching entirely.
describe('CoachPanel — crisis path', () => {
  it('renders support instead of insights', () => {
    seed();
    useCoachStore.setState({ insights: [INSIGHT], crisisTopic: 'self_harm' });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-support-surface')).toBeTruthy();
    expect(screen.queryByTestId('coach-insight-finance')).toBeNull();
  });

  it('points at the resource matching the topic', () => {
    seed();
    // A US phone, whatever the machine running the tests is set to.
    __setDeviceLocaleForTests('en-US');
    useCoachStore.setState({ crisisTopic: 'eating_disorder' });
    render(<CoachPanel />);

    expect(screen.getByTestId('support-contact').props.children).toMatch(
      /Eating Disorders/,
    );
  });

  it('offers no statistic or suggestion on the support surface', () => {
    seed();
    useCoachStore.setState({ crisisTopic: 'distress' });
    render(<CoachPanel />);

    expect(screen.queryByText(/\d+%/)).toBeNull();
    expect(screen.queryByTestId('coach-insight-finance')).toBeNull();
  });

  // The upsell is the only Plus surface a free user meets on Stats, and it
  // sits below their own numbers — the score, curve, badges and share card
  // above it are free and already rendered.
  it('routes a free user to the paywall without gating anything else', () => {
    seed({ isPlus: false });
    const onUpgrade = jest.fn();
    render(<CoachPanel onUpgrade={onUpgrade} />);

    fireEvent.press(screen.getByTestId('coach-upsell-cta'));
    expect(onUpgrade).toHaveBeenCalled();
  });

  it('shows no upsell button when the screen offers no route to one', () => {
    seed({ isPlus: false });
    render(<CoachPanel />);

    expect(screen.getByTestId('coach-upsell')).toBeTruthy();
    expect(screen.queryByTestId('coach-upsell-cta')).toBeNull();
  });
});

describe('CoachPanel — control and trust', () => {
  it('lets the user dismiss an insight', () => {
    seed();
    useCoachStore.setState({
      insights: [INSIGHT],
      lastAnsweredAt: '2026-08-29T12:00:00.000Z',
    });
    render(<CoachPanel />);

    fireEvent.press(screen.getByTestId('coach-dismiss-finance'));
    expect(screen.queryByTestId('coach-insight-finance')).toBeNull();
  });

  it('says once that the Coach can be wrong', () => {
    seed();
    useCoachStore.setState({
      insights: [INSIGHT, { ...INSIGHT, category: 'health' }],
      lastAnsweredAt: '2026-08-29T12:00:00.000Z',
    });
    render(<CoachPanel />);

    expect(screen.getAllByTestId('coach-caveat')).toHaveLength(1);
  });
});
