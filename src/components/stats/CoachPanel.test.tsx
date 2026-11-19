import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { LOCAL_ONLY_COACH } from '@/components/age/localOnlyCopy';
import { __setDeviceLocaleForTests } from '@/constants/locale';
import { colors, type as typeTokens } from '@/constants/theme';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import { useCategoryStore } from '@/store/categoryStore';
import { useCoachStore } from '@/store/coachStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePredictionStore } from '@/store/predictionStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { FREE_ENTITLEMENT, type CoachInsight, type Prediction, type UserStat } from '@/types';

import { CoachPanel } from './CoachPanel';
import { SUPPORT_ASIDE_NOTE } from './SupportSurface';

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

  // Main session, 2026-11-19: with "Back to Coach" on the card, a second
  // button that only rescans and brings the same card back read as a dead
  // end. The card is the whole panel while it is up, under the heading.
  it('shows no ask button, and no loading, failure or caveat line, while the card is up', () => {
    seed();
    useCoachStore.setState({
      insights: [INSIGHT],
      crisisTopic: 'self_harm',
      loading: true,
      lastRequestFailed: true,
      lastFailure: null,
      lastAnsweredAt: '2026-08-29T12:00:00.000Z',
    });
    try {
      render(<CoachPanel />);

      expect(screen.getByTestId('coach-support-surface')).toBeTruthy();
      expect(screen.queryByTestId('coach-ask')).toBeNull();
      expect(screen.queryByText('Get feedback')).toBeNull();
      expect(screen.queryByText('Reading your numbers…')).toBeNull();
      for (const id of [
        'coach-unavailable',
        'coach-not-confirmed',
        'coach-nothing-scored',
        'coach-nothing-to-say',
        'coach-nothing-backed',
        'coach-caveat',
        'coach-disclosure',
      ]) {
        expect(screen.queryByTestId(id)).toBeNull();
      }
      // The heading and the AI label stay.
      expect(screen.getByText('Coach')).toBeTruthy();
      expect(screen.getByText('AI')).toBeTruthy();
      screen.unmount();
    } finally {
      useCoachStore.setState({
        insights: [],
        crisisTopic: null,
        loading: false,
        lastRequestFailed: false,
        lastAnsweredAt: null,
      });
    }
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

// Main session decision 2026-11-19: the support card can be set aside, since
// an answered prediction can't be deleted after its 24 hours and one false
// match would otherwise replace the Coach for good.
describe('CoachPanel — setting the support card aside', () => {
  const answered = (id: string, title: string): Prediction => ({
    id,
    user_id: 'u1',
    title,
    category: 'work',
    confidence: 70,
    created_at: '2026-11-01T12:00:00.000Z',
    due_date: '2026-11-03T12:00:00.000Z',
    status: 'resolved_yes',
    resolved_at: '2026-11-03T19:00:00.000Z',
    reflection: null,
    integrity_bonus: false,
  });
  const RESOLVED = [
    answered('a1', 'Finish the report by Friday'),
    answered('t1', 'I want to die before the launch'),
  ];
  const realSetSupportAside = useCoachStore.getState().setSupportAside;
  const realRequestInsights = useCoachStore.getState().requestInsights;

  beforeEach(() => {
    __setPersistenceForTests({ load: async () => null, save: async () => {} });
    seed();
    usePredictionStore.setState({ pending: [], resolved: RESOLVED });
    useCoachStore.setState({ crisisTopic: 'self_harm' });
  });

  afterEach(() => {
    // In act: the panel is still on screen here.
    act(() => {
      useCoachStore.setState({
        setSupportAside: realSetSupportAside,
        requestInsights: realRequestInsights,
        crisisTopic: null,
      });
      useSettingsStore.setState({ supportAsideKeys: [] });
      __setPersistenceForTests(null);
    });
  });

  it('says why it came up under the contact line, quietly, with a way back to Coach', () => {
    render(<CoachPanel />);
    const card = screen.getByTestId('coach-support-surface');
    const note = screen.getByTestId('support-aside-note');
    expect(note.props.children).toBe(
      "This came up because of words in one of your predictions or notes, checked on this phone. If it doesn't fit, you can go back to Coach.",
    );
    expect(note.props.children).toBe(SUPPORT_ASIDE_NOTE);
    expect(StyleSheet.flatten(note.props.style)).toMatchObject({
      fontSize: typeTokens.footnote.fontSize,
      color: colors.textSecondary,
    });
    expect(card).toContainElement(note);
    expect(card).toContainElement(screen.getByTestId('support-back-to-coach'));
    expect(screen.getByText('Back to Coach')).toBeTruthy();
    // The helpline line stays above it, and stays selectable.
    const contact = screen.getByTestId('support-contact');
    expect(contact.props.selectable).toBe(true);
    const texts = screen.UNSAFE_getAllByType(Text).map((t) => t.props.testID);
    expect(texts.indexOf('support-contact')).toBeLessThan(texts.indexOf('support-aside-note'));
  });

  it('sets aside the same list of answered predictions the panel asks with', async () => {
    const setSupportAside = jest.fn(async () => false);
    const requestInsights = jest.fn(async () => {});
    useCoachStore.setState({ setSupportAside, requestInsights });
    render(<CoachPanel />);

    fireEvent.press(screen.getByTestId('support-back-to-coach'));
    await waitFor(() => expect(setSupportAside).toHaveBeenCalledTimes(1));
    expect(setSupportAside).toHaveBeenCalledWith(RESOLVED);

    // The very array the request is given, asked once the card has gone
    // (there is no ask button under it).
    await waitFor(() =>
      expect(screen.getByTestId('support-back-to-coach').props.accessibilityState.disabled).toBe(false),
    );
    act(() => useCoachStore.setState({ crisisTopic: null }));
    fireEvent.press(screen.getByTestId('coach-ask'));
    await waitFor(() => expect(requestInsights).toHaveBeenCalledTimes(1));
    const request = (requestInsights.mock.calls[0] as unknown as [{ resolved: unknown }])[0];
    expect((setSupportAside.mock.calls[0] as unknown as [unknown])[0]).toBe(request.resolved);
  });

  it('goes back to the ask button once it resolves true', async () => {
    // The store's own action, on a record whose second title trips the check.
    render(<CoachPanel />);
    expect(screen.queryByTestId('coach-ask')).toBeNull();
    fireEvent.press(screen.getByTestId('support-back-to-coach'));

    await waitFor(() => expect(screen.queryByTestId('coach-support-surface')).toBeNull());
    expect(screen.getByTestId('coach-ask').props.accessibilityState.disabled).toBe(false);
    // The first idle state: the disclosure before a first request, no line about an answer.
    expect(screen.getByTestId('coach-disclosure')).toBeTruthy();
    expect(screen.queryByTestId('coach-nothing-to-say')).toBeNull();
    expect(useCoachStore.getState().crisisTopic).toBeNull();
    // Remembered on this phone: one key, for the one tripping prediction.
    expect(useSettingsStore.getState().supportAsideKeys).toHaveLength(1);
  });

  it('leaves the card up, with no ask button, when it resolves false, and offers its button again', async () => {
    let finish: (value: boolean) => void = () => {};
    const setSupportAside = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    useCoachStore.setState({ setSupportAside });
    render(<CoachPanel />);

    fireEvent.press(screen.getByTestId('support-back-to-coach'));
    // While it runs, a second press does nothing.
    await waitFor(() =>
      expect(screen.getByTestId('support-back-to-coach').props.accessibilityState.disabled).toBe(true),
    );
    fireEvent.press(screen.getByTestId('support-back-to-coach'));
    expect(setSupportAside).toHaveBeenCalledTimes(1);

    await act(async () => finish(false));
    expect(screen.getByTestId('coach-support-surface')).toBeTruthy();
    expect(screen.getByTestId('support-back-to-coach').props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByTestId('coach-ask')).toBeNull();
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
