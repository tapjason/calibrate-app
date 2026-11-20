import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';

import { LOCAL_ONLY_COACH } from '@/components/age/localOnlyCopy';
import { __setDeviceLocaleForTests } from '@/constants/locale';
import { colors, type as typeTokens } from '@/constants/theme';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import { useCategoryStore } from '@/store/categoryStore';
import { useCoachStore, type SupportAsideOutcome } from '@/store/coachStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePredictionStore } from '@/store/predictionStore';
import { __setPersistenceForTests, useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { FREE_ENTITLEMENT, type CoachInsight, type Prediction, type UserStat } from '@/types';

import { BACK_TO_COACH_ANNOUNCE_MS, CoachPanel } from './CoachPanel';
import {
  ANNOUNCE_AFTER_FOCUS_MS,
  BACK_TO_COACH_SPOKEN,
  SUPPORT_ASIDE_FAILED,
  SUPPORT_ASIDE_NOTE,
  SUPPORT_CHANGED_HOLD_MS,
  SUPPORT_UPDATED_NOTE,
} from './SupportSurface';

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

/** The support card's contact on a US phone, on every topic (the owner, 2026-11-20). */
const US_SUPPORT_CONTACT =
  '988 Suicide & Crisis Lifeline — call or text 988 (US)\nOutside the US: search for a crisis line in your country, or call your local emergency number.';
/** The eating-disorder and abuse cards' own words, above that contact. */
const EATING_DISORDER_BODY =
  'If your relationship with food or your body is weighing on you, there are people who can help.';
const ABUSE_BODY = 'If someone is hurting you or you feel unsafe, there are people you can talk to.';

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

  // The topic's own words, and 988 under them on a US phone whatever the
  // topic (the owner, 2026-11-20).
  it.each([
    ['eating_disorder', EATING_DISORDER_BODY],
    ['abuse', ABUSE_BODY],
  ] as const)('shows the %s card’s own words over the 988 line', (topic, body) => {
    seed();
    // A US phone, whatever the machine running the tests is set to.
    __setDeviceLocaleForTests('en-US');
    useCoachStore.setState({ crisisTopic: topic });
    render(<CoachPanel />);

    expect(screen.getByText(body)).toBeTruthy();
    expect(screen.getByTestId('support-contact').props.children).toBe(US_SUPPORT_CONTACT);
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
  const realBackToCoach = useCoachStore.getState().backToCoach;
  const realRequestInsights = useCoachStore.getState().requestInsights;

  /** The button, as it is now. */
  const back = () => screen.getByTestId('support-back-to-coach');
  /** Every host element with a testID, in the order they are drawn. */
  type Node = { type: unknown; props: { testID?: unknown } };
  const drawnOrder = (): string[] =>
    screen.UNSAFE_root
      .findAll((n: Node) => typeof n.type === 'string' && typeof n.props.testID === 'string')
      .map((n: Node) => n.props.testID as string);

  let focus: jest.SpyInstance;
  let announce: jest.SpyInstance;
  let announceQueued: jest.SpyInstance;

  beforeEach(() => {
    __setPersistenceForTests({ load: async () => null, save: async () => {} });
    seed();
    // The store's own memory of which topics were shown starts afresh.
    useCoachStore.getState().reset();
    usePredictionStore.setState({ pending: [], resolved: RESOLVED });
    useCoachStore.setState({ crisisTopic: 'self_harm' });
    focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announceQueued = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions');
  });

  afterEach(() => {
    focus.mockRestore();
    announce.mockRestore();
    announceQueued.mockRestore();
    // In act: the panel is still on screen here.
    act(() => {
      useCoachStore.setState({
        backToCoach: realBackToCoach,
        requestInsights: realRequestInsights,
        crisisTopic: null,
      });
      useSettingsStore.setState({ supportAsideKeys: [] });
      __setPersistenceForTests(null);
    });
  });

  /**
   * VoiceOver was moved to the panel's heading, once, and told "Back to
   * Coach." a moment later, queued behind what it was reading.
   */
  async function expectBackToCoachSaid() {
    await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
    const [node, kind] = focus.mock.calls[0] as [{ props: Record<string, unknown> }, string];
    expect(kind).toBe('focus');
    expect(node.props).toMatchObject({ accessibilityRole: 'header', children: 'Coach' });
    await waitFor(() => expect(announceQueued).toHaveBeenCalledWith(BACK_TO_COACH_SPOKEN, { queue: true }));
    expect(BACK_TO_COACH_SPOKEN).toBe('Back to Coach.');
    expect(announceQueued).toHaveBeenCalledTimes(1);
    expect(BACK_TO_COACH_ANNOUNCE_MS).toBe(600);
  }

  /**
   * After 'updated': VoiceOver was moved to the card's title (the new card is
   * read from the top), `times` times in all, and the line about other words
   * said as often, queued behind what is being read.
   */
  async function expectCardReadFromTheTop(times: number) {
    await waitFor(() => expect(focus).toHaveBeenCalledTimes(times));
    for (const [node, kind] of focus.mock.calls as [{ props: Record<string, unknown> }, string][]) {
      expect(kind).toBe('focus');
      expect(node.props.testID).toBe('support-title');
      expect(node.props.children).toBe(screen.getByTestId('support-title').props.children);
    }
    await waitFor(() => expect(announceQueued).toHaveBeenCalledTimes(times));
    expect(announceQueued.mock.calls).toEqual(
      Array.from({ length: times }, () => [SUPPORT_UPDATED_NOTE, { queue: true }]),
    );
  }

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

  it('asks with the same list of answered predictions the panel asks the Coach with', async () => {
    const backToCoach = jest.fn(async (): Promise<SupportAsideOutcome> => 'failed');
    const requestInsights = jest.fn(async () => {});
    useCoachStore.setState({ backToCoach, requestInsights });
    render(<CoachPanel />);

    fireEvent.press(back());
    await waitFor(() => expect(backToCoach).toHaveBeenCalledTimes(1));
    expect(backToCoach).toHaveBeenCalledWith(RESOLVED);

    // The very array the request is given, asked once the card has gone
    // (there is no ask button under it).
    await waitFor(() => expect(back().props.accessibilityState.disabled).toBe(false));
    act(() => useCoachStore.setState({ crisisTopic: null }));
    fireEvent.press(screen.getByTestId('coach-ask'));
    await waitFor(() => expect(requestInsights).toHaveBeenCalledTimes(1));
    const request = (requestInsights.mock.calls[0] as unknown as [{ resolved: unknown }])[0];
    expect((backToCoach.mock.calls[0] as unknown as [unknown])[0]).toBe(request.resolved);
  });

  // 'aside': every topic that trips has been shown, so the store sets the
  // tripping predictions aside and the panel is back to its first state.
  it('goes back to the ask button once the card is set aside, and moves VoiceOver to the heading', async () => {
    // The store's own action, on a record whose second title trips the check.
    render(<CoachPanel />);
    expect(screen.queryByTestId('coach-ask')).toBeNull();
    fireEvent.press(back());

    await waitFor(() => expect(screen.queryByTestId('coach-support-surface')).toBeNull());
    expect(screen.getByTestId('coach-ask').props.accessibilityState.disabled).toBe(false);
    // The first idle state: the disclosure before a first request, no line about an answer.
    expect(screen.getByTestId('coach-disclosure')).toBeTruthy();
    expect(screen.queryByTestId('coach-nothing-to-say')).toBeNull();
    expect(useCoachStore.getState().crisisTopic).toBeNull();
    // Remembered on this phone: one key, for the one tripping prediction.
    expect(useSettingsStore.getState().supportAsideKeys).toHaveLength(1);
    await expectBackToCoachSaid();
    // Neither of the card's own lines was said.
    expect(announce).not.toHaveBeenCalled();
  });

  // 'cleared': the words that put the card up are gone (a note removed, a
  // delete), so the card goes and nothing is set aside.
  it('goes back to Coach, setting nothing aside, when the words that put the card up are gone', async () => {
    usePredictionStore.setState({ resolved: [RESOLVED[0]!] });
    render(<CoachPanel />);
    fireEvent.press(back());

    await waitFor(() => expect(screen.queryByTestId('coach-support-surface')).toBeNull());
    expect(useCoachStore.getState().crisisTopic).toBeNull();
    expect(useSettingsStore.getState().supportAsideKeys).toEqual([]);
    expect(screen.getByTestId('coach-ask').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId('coach-disclosure')).toBeTruthy();
    await expectBackToCoachSaid();
    expect(announce).not.toHaveBeenCalled();
  });

  // 'updated': other words matched too, of a topic not yet shown; the store
  // has put that card up instead, and nothing was set aside.
  it('says when other words changed the card, above the button, until the card changes again', async () => {
    // A US phone, so the contact line is 988 and the line for elsewhere.
    __setDeviceLocaleForTests('en-US');
    const backToCoach = jest.fn(async (): Promise<SupportAsideOutcome> => {
      useCoachStore.setState({ crisisTopic: 'eating_disorder' });
      return 'updated';
    });
    useCoachStore.setState({ backToCoach });
    render(<CoachPanel />);
    expect(screen.queryByTestId('support-updated-note')).toBeNull();

    fireEvent.press(back());
    const line = await screen.findByTestId('support-updated-note');
    expect(line.props.children).toBe('Other words matched too, so this message changed.');
    expect(line.props.children).toBe(SUPPORT_UPDATED_NOTE);
    // VoiceOver goes to the card's title, so the new card is read from the
    // top, and the line is said a moment later, queued behind it; never at once.
    await expectCardReadFromTheTop(1);
    expect(announce).not.toHaveBeenCalled();
    // Plain ink in the body's size: no colour on this card.
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({
      fontSize: typeTokens.subhead.fontSize,
      color: colors.textPrimary,
    });
    // The new topic's card, still up, under the same heading: its own words,
    // over the same 988 line; the button offered again, above which the line
    // sits; no ask button.
    expect(screen.getByText(EATING_DISORDER_BODY)).toBeTruthy();
    expect(screen.getByTestId('support-contact').props.children).toBe(US_SUPPORT_CONTACT);
    await waitFor(() => expect(back().props.accessibilityState.disabled).toBe(false));
    const order = drawnOrder();
    expect(order).toEqual(
      expect.arrayContaining(['support-aside-note', 'support-updated-note', 'support-back-to-coach']),
    );
    expect(order.indexOf('support-aside-note')).toBeLessThan(order.indexOf('support-updated-note'));
    expect(order.indexOf('support-updated-note')).toBeLessThan(order.indexOf('support-back-to-coach'));
    expect(screen.queryByTestId('coach-ask')).toBeNull();
    expect(useSettingsStore.getState().supportAsideKeys).toEqual([]);
    // Moved once, to the title: not to the heading, which is for the card going.
    expect(focus).toHaveBeenCalledTimes(1);
    expect(announceQueued).not.toHaveBeenCalledWith(BACK_TO_COACH_SPOKEN, expect.anything());

    // A tap that fails after it: the card didn't change, so the line stays,
    // and focus stays on the button, which stayed.
    backToCoach.mockImplementationOnce(async () => 'failed');
    fireEvent.press(back());
    await screen.findByTestId('support-aside-failed');
    expect(screen.getByTestId('support-updated-note')).toBeTruthy();
    expect(focus).toHaveBeenCalledTimes(1);

    // The card changes again: the line goes with the change, and the button
    // rests its second for that change too, wherever it came from.
    act(() => useCoachStore.setState({ crisisTopic: 'abuse' }));
    expect(screen.getByText(ABUSE_BODY)).toBeTruthy();
    expect(screen.getByTestId('support-contact').props.children).toBe(US_SUPPORT_CONTACT);
    expect(screen.queryByTestId('support-updated-note')).toBeNull();
    expect(screen.queryByTestId('support-aside-failed')).toBeNull();
    expect(back().props.accessibilityState.disabled).toBe(true);
    await waitFor(() => expect(back().props.accessibilityState.disabled).toBe(false));
  });

  // Re-review 2026-11-19: after 'updated' the card had changed (perhaps to
  // another helpline) while VoiceOver stayed on the button and heard only the
  // line about other words, so the next double-tap set the new card aside
  // unheard; a quick second tap did the same, the button back in the same frame.
  it('reads the new card from its title and rests the button a second before it can set it aside', async () => {
    jest.useFakeTimers();
    try {
      __setDeviceLocaleForTests('en-US');
      const backToCoach = jest.fn(async (): Promise<SupportAsideOutcome> => {
        useCoachStore.setState({ crisisTopic: 'eating_disorder' });
        return 'updated';
      });
      useCoachStore.setState({ backToCoach });
      render(<CoachPanel />);

      fireEvent.press(back());
      await act(async () => {});
      expect(screen.getByTestId('support-updated-note')).toBeTruthy();
      expect(screen.getByText(EATING_DISORDER_BODY)).toBeTruthy();
      expect(screen.getByTestId('support-contact').props.children).toBe(US_SUPPORT_CONTACT);

      // Focus is on the title at once: the new card is read from its top.
      expect(focus).toHaveBeenCalledTimes(1);
      const [node, kind] = focus.mock.calls[0] as [{ props: Record<string, unknown> }, string];
      expect(kind).toBe('focus');
      expect(node.props.testID).toBe('support-title');
      // The line waits behind it, then is queued, not said over it.
      expect(announceQueued).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(ANNOUNCE_AFTER_FOCUS_MS - 1));
      expect(announceQueued).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(1));
      expect(announceQueued).toHaveBeenCalledWith(SUPPORT_UPDATED_NOTE, { queue: true });
      expect(announceQueued).toHaveBeenCalledTimes(1);
      expect(announce).not.toHaveBeenCalled();
      expect(ANNOUNCE_AFTER_FOCUS_MS).toBe(600);
      expect(BACK_TO_COACH_ANNOUNCE_MS).toBe(ANNOUNCE_AFTER_FOCUS_MS);

      // The button stays off for the second: a quick second tap does nothing.
      expect(back().props.accessibilityState.disabled).toBe(true);
      fireEvent.press(back());
      await act(async () => {});
      expect(backToCoach).toHaveBeenCalledTimes(1);
      act(() => jest.advanceTimersByTime(SUPPORT_CHANGED_HOLD_MS - ANNOUNCE_AFTER_FOCUS_MS - 1));
      expect(back().props.accessibilityState.disabled).toBe(true);
      act(() => jest.advanceTimersByTime(1));
      expect(back().props.accessibilityState.disabled).toBe(false);
      expect(SUPPORT_CHANGED_HOLD_MS).toBe(1000);

      // Then it works again, for the card now shown.
      fireEvent.press(back());
      await act(async () => {});
      expect(backToCoach).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('says nothing when the card goes inside that moment: its timer goes with it', async () => {
    jest.useFakeTimers();
    try {
      __setDeviceLocaleForTests('en-US');
      const backToCoach = jest.fn(async (): Promise<SupportAsideOutcome> => {
        useCoachStore.setState({ crisisTopic: 'eating_disorder' });
        return 'updated';
      });
      useCoachStore.setState({ backToCoach });
      render(<CoachPanel />);

      fireEvent.press(back());
      await act(async () => {});
      expect(focus).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('support-contact').props.children).toBe(US_SUPPORT_CONTACT);
      // The card goes before the line is said (the words were removed elsewhere).
      act(() => useCoachStore.setState({ crisisTopic: null }));
      expect(screen.queryByTestId('coach-support-surface')).toBeNull();
      act(() => jest.advanceTimersByTime(SUPPORT_CHANGED_HOLD_MS * 2));
      expect(announceQueued).not.toHaveBeenCalled();
      expect(announce).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('says it again when another tap changes the card again', async () => {
    __setDeviceLocaleForTests('en-US');
    const topics = ['eating_disorder', 'abuse'] as const;
    let next = 0;
    const backToCoach = jest.fn(async (): Promise<SupportAsideOutcome> => {
      useCoachStore.setState({ crisisTopic: topics[next++]! });
      return 'updated';
    });
    useCoachStore.setState({ backToCoach });
    render(<CoachPanel />);

    fireEvent.press(back());
    await screen.findByTestId('support-updated-note');
    await expectCardReadFromTheTop(1);
    await waitFor(() => expect(back().props.accessibilityState.disabled).toBe(false));
    fireEvent.press(back());
    await waitFor(() => expect(useCoachStore.getState().crisisTopic).toBe('abuse'));
    // Each change moves focus to the title again, and says the line again, queued.
    await expectCardReadFromTheTop(2);
    expect(screen.getByTestId('support-updated-note')).toBeTruthy();
    expect(announce).not.toHaveBeenCalled();
    // The abuse card's own words, over the same 988 line.
    expect(screen.getByText(ABUSE_BODY)).toBeTruthy();
    expect(screen.getByTestId('support-contact').props.children).toBe(US_SUPPORT_CONTACT);
  });

  // The store's own 'updated': a card for distress is up, and the record
  // holds words of self-harm, a topic whose card hasn't been shown.
  it('puts the other topic’s card up through the store’s own action, then sets both aside', async () => {
    useCoachStore.setState({ crisisTopic: 'distress' });
    render(<CoachPanel />);

    fireEvent.press(back());
    expect(await screen.findByTestId('support-updated-note')).toBeTruthy();
    expect(useCoachStore.getState().crisisTopic).toBe('self_harm');
    expect(useSettingsStore.getState().supportAsideKeys).toEqual([]);
    await expectCardReadFromTheTop(1);

    // Every topic that trips has been shown now: the next tap sets it aside.
    await waitFor(() => expect(back().props.accessibilityState.disabled).toBe(false));
    // From here, only what the card's going does.
    focus.mockClear();
    announceQueued.mockClear();
    fireEvent.press(back());
    await waitFor(() => expect(screen.queryByTestId('coach-support-surface')).toBeNull());
    expect(useSettingsStore.getState().supportAsideKeys).toHaveLength(1);
    expect(screen.queryByTestId('support-updated-note')).toBeNull();
    await expectBackToCoachSaid();
  });

  // 'failed': the card stays as it was, the button comes back, and the line
  // says so, shown and said.
  it('leaves the card up when it fails, says so, and offers its button again', async () => {
    let finish: (value: SupportAsideOutcome) => void = () => {};
    const backToCoach = jest.fn(
      () =>
        new Promise<SupportAsideOutcome>((resolve) => {
          finish = resolve;
        }),
    );
    useCoachStore.setState({ backToCoach });
    render(<CoachPanel />);

    fireEvent.press(back());
    // While it runs, a second press does nothing.
    await waitFor(() => expect(back().props.accessibilityState.disabled).toBe(true));
    fireEvent.press(back());
    expect(backToCoach).toHaveBeenCalledTimes(1);

    await act(async () => finish('failed'));
    expect(screen.getByTestId('coach-support-surface')).toBeTruthy();
    expect(back().props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByTestId('coach-ask')).toBeNull();
    const line = screen.getByTestId('support-aside-failed');
    expect(line.props.children).toBe("Couldn't go back to Coach. Try again.");
    expect(line.props.children).toBe(SUPPORT_ASIDE_FAILED);
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ color: colors.textPrimary });
    expect(announce).toHaveBeenCalledWith(SUPPORT_ASIDE_FAILED);
    const order = drawnOrder();
    expect(order).toEqual(expect.arrayContaining(['support-aside-note', 'support-aside-failed']));
    expect(order.indexOf('support-aside-note')).toBeLessThan(order.indexOf('support-aside-failed'));
    expect(order.indexOf('support-aside-failed')).toBeLessThan(order.indexOf('support-back-to-coach'));
    expect(screen.queryByTestId('support-updated-note')).toBeNull();
    expect(focus).not.toHaveBeenCalled();

    // Tried again: the old line goes at the tap, and a second failure is said again.
    fireEvent.press(back());
    await waitFor(() => expect(screen.queryByTestId('support-aside-failed')).toBeNull());
    await act(async () => finish('failed'));
    expect(screen.getByTestId('support-aside-failed')).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('reads an action that throws as a failure', async () => {
    const backToCoach = jest.fn(async (): Promise<SupportAsideOutcome> => {
      throw new Error('disk');
    });
    useCoachStore.setState({ backToCoach });
    render(<CoachPanel />);

    fireEvent.press(back());
    expect(await screen.findByTestId('support-aside-failed')).toBeTruthy();
    expect(back().props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId('coach-support-surface')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(SUPPORT_ASIDE_FAILED);
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
