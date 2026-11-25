import type { SupabaseClient } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { LOCAL_ONLY_COACH } from '@/components/age/localOnlyCopy';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import { useCategoryStore } from '@/store/categoryStore';
import { useCoachStore } from '@/store/coachStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { setSupabaseClientForTests } from '@/supabase/client';
import { FREE_ENTITLEMENT, type CoachInsight, type Prediction, type UserStat } from '@/types';

import { CoachPanel } from './CoachPanel';

// What a request records is coachStore's to test; here it only stays off the
// database.
jest.mock('@/analytics/track', () => ({ track: jest.fn(async () => undefined) }));

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
    loading: false,
    lastAnsweredAt: null,
    lastRequestFailed: false,
    lastFailure: null,
    lastDroppedAll: false,
  });
}

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

  // Security review, 2026-11-18: a renamed built-in's header and its drift
  // receipt must name it alike. "Hide the words" is gone (2026-11-25), so both
  // use the person's own name.
  it('names a drift by the same words as its header', () => {
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
      expect(card).toHaveTextContent(/Fitness/);
      expect(screen.getByTestId('coach-receipt').props.accessibilityLabel).toBe(
        '+6, change in your Fitness score, earlier to recent',
      );
      expect(card).not.toHaveTextContent(/health|Your own category/);
    } finally {
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

describe('CoachPanel — the upsell', () => {
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

// D73 (2026-11-20): no scan of the person's words and no support card. The
// panel asks through the real store and Coach client, against a fake Supabase
// client that keeps each request body as it would go over the wire.
describe("CoachPanel — the person's words and an answer marked unsafe (D73)", () => {
  const TITLE = 'Finish the tax return by Friday';
  const NOTE = "I can't go on";

  /** Answered, with a note the old filter would have caught. */
  const ANSWERED: Prediction = {
    id: 'p-note',
    user_id: 'u1',
    title: TITLE,
    category: 'finance',
    confidence: 80,
    created_at: '2026-11-01T12:00:00.000Z',
    due_date: '2026-11-05T12:00:00.000Z',
    status: 'resolved_yes',
    resolved_at: '2026-11-05T19:00:00.000Z',
    reflection: NOTE,
    integrity_bonus: false,
  };

  /** Grounded in the overall count, so the validators keep it. */
  const OVERALL_INSIGHT = {
    type: 'pattern',
    category: 'overall',
    message: 'You have 40 scored answers in total.',
    evidence: 40,
  };

  function serverAnswering(data: unknown): string[] {
    const bodies: string[] = [];
    setSupabaseClientForTests({
      functions: {
        invoke: async (_name: string, opts: { body: unknown }) => {
          bodies.push(JSON.stringify(opts.body));
          return { data, error: null };
        },
      },
    } as unknown as SupabaseClient);
    return bodies;
  }

  /** Nothing of the support card the panel used to draw. */
  function expectNoSupportCard(): void {
    expect(screen.queryByTestId('coach-support-surface')).toBeNull();
    expect(screen.queryByText(/Support is available|988|Back to Coach|crisis line/)).toBeNull();
  }

  // The store's own action, taken when the tests are collected: a test above
  // puts a stand-in in its place.
  const realRequestInsights = useCoachStore.getState().requestInsights;
  beforeEach(() => useCoachStore.setState({ requestInsights: realRequestInsights }));

  afterEach(() => {
    setSupabaseClientForTests(null);
    useCoachStore.getState().reset();
  });

  it('asks as for anyone, shows the insights, and sends neither the title nor the note', async () => {
    seed();
    usePredictionStore.setState({ pending: [], resolved: [ANSWERED] });
    const bodies = serverAnswering({ insights: [OVERALL_INSIGHT], safe: true });
    render(<CoachPanel />);

    fireEvent.press(screen.getByTestId('coach-ask'));

    expect(await screen.findByTestId('coach-insight-overall')).toBeTruthy();
    expect(screen.getByText('You have 40 scored answers in total.')).toBeTruthy();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toContain(TITLE);
    expect(bodies[0]).not.toContain('go on');
    expectNoSupportCard();
    expect(screen.getByTestId('coach-ask')).toBeTruthy();
  });

  it('shows an answer marked safe: false as one with nothing to say, the cards before it gone', async () => {
    seed();
    usePredictionStore.setState({ pending: [], resolved: [ANSWERED] });
    useCoachStore.setState({ insights: [INSIGHT], lastAnsweredAt: '2026-08-29T12:00:00.000Z' });
    const bodies = serverAnswering({ insights: [OVERALL_INSIGHT], safe: false });
    render(<CoachPanel />);
    expect(screen.getByTestId('coach-insight-finance')).toBeTruthy();

    fireEvent.press(screen.getByTestId('coach-ask'));

    expect(await screen.findByTestId('coach-nothing-to-say')).toBeTruthy();
    expect(bodies).toHaveLength(1);
    expect(screen.queryByTestId('coach-insight-finance')).toBeNull();
    expect(screen.queryByTestId('coach-insight-overall')).toBeNull();
    expect(screen.queryByTestId('coach-caveat')).toBeNull();
    expect(screen.queryByTestId('coach-unavailable')).toBeNull();
    expectNoSupportCard();
    await waitFor(() =>
      expect(screen.getByTestId('coach-ask').props.accessibilityState.disabled).toBe(false),
    );
  });
});

// The under-13 rule (roadmap D70): the Coach is off on a local-only phone.
// With a Plus mirror the panel says so; otherwise it isn't drawn. Nothing
// offers Plus or a sign-in, and there is no way to ask.
describe('CoachPanel — under the under-13 rule', () => {
  afterEach(() => act(() => __resetAgeStoreForTests()));

  it.each([
    ['signed in, Coach on', {}],
    ['a guest', { signedIn: false }],
    ['Coach off', { coachEnabled: false }],
  ])('says the Coach is off where a Plus mirror is active (%s)', (_label, who) => {
    seed(who);
    useAgeStore.setState({ localOnly: true });
    render(<CoachPanel onUpgrade={jest.fn()} onSignIn={jest.fn()} />);

    expect(screen.getByTestId('coach-local-only')).toBeTruthy();
    expect(screen.getByText(LOCAL_ONLY_COACH)).toBeTruthy();
    for (const id of [
      'coach-ask',
      'coach-sign-in',
      'coach-upsell-cta',
      'coach-needs-account',
      'coach-panel',
      'coach-disabled',
    ]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
  });

  it('is not drawn without Plus, even where the screen offers an upsell', () => {
    seed({ isPlus: false });
    useAgeStore.setState({ localOnly: true });
    render(<CoachPanel onUpgrade={jest.fn()} />);
    expect(screen.toJSON()).toBeNull();
  });

  // A request under the rule returns ok: false with no failure; the panel
  // shows the rule's line, not "unavailable".
  it('shows the line in place of a request that came back empty', () => {
    seed();
    useCoachStore.setState({ lastRequestFailed: true, lastFailure: null });
    useAgeStore.setState({ localOnly: true });
    render(<CoachPanel />);
    expect(screen.getByTestId('coach-local-only')).toBeTruthy();
    expect(screen.queryByTestId('coach-unavailable')).toBeNull();
    screen.unmount();
    useCoachStore.setState({ lastRequestFailed: false });
  });

  it('is the usual panel without the rule', () => {
    seed();
    useAgeStore.setState({ localOnly: false });
    render(<CoachPanel />);
    expect(screen.queryByTestId('coach-local-only')).toBeNull();
    expect(screen.getByTestId('coach-ask')).toBeTruthy();
  });
});
