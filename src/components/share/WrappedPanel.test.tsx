import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { holdRanges } from '@/components/ui/holdRanges';
import { __setShareDepsForTests, type ShareDeps } from '@/share/export';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { MIN_N_OVERALL, type CategoryStat, type Prediction } from '@/types';

import { haptics } from '@/components/ui/haptics';

import { __resetRevealedWeeksForTests, WrappedPanel } from './WrappedPanel';

jest.mock('@/components/ui/haptics', () => ({
  haptics: {
    commit: jest.fn(),
    detent: jest.fn(),
    resolve: jest.fn(),
    reveal: jest.fn(),
    unlock: jest.fn(),
  },
}));

let seq = 0;

/**
 * Resolved today, so it always lands inside the seven-day window, and logged
 * the day before: a same-day answer isn't scored (roadmap D41).
 */
function prediction(over: Partial<Prediction> = {}): Prediction {
  seq += 1;
  const now = new Date().toISOString();
  const dayBefore = new Date(Date.now() - 86_400_000).toISOString();
  return {
    id: `p${seq}`,
    user_id: 'u1',
    title: `Prediction ${seq}`,
    category: 'work',
    confidence: 80,
    created_at: dayBefore,
    due_date: now,
    status: 'resolved_yes',
    resolved_at: now,
    reflection: null,
    integrity_bonus: false,
    ...over,
  };
}

function run(n: number, yes: number, over: Partial<Prediction> = {}): Prediction[] {
  return Array.from({ length: n }, (_, i) =>
    prediction({ status: i < yes ? 'resolved_yes' : 'resolved_no', ...over }),
  );
}

function shareDeps(over: Partial<ShareDeps> = {}): ShareDeps {
  return {
    capture: jest.fn(async () => 'file:///tmp/wrapped.png'),
    isAvailable: jest.fn(async () => true),
    share: jest.fn(async () => undefined),
    ...over,
  };
}

function seed(resolved: Prediction[]): void {
  usePredictionStore.setState({ pending: [], resolved });
}

function seedOverall(totalResolved: number, streak = 0): void {
  useStatsStore.setState({
    userStat: {
      user_id: 'u1',
      calibration_rating: 70,
      total_predictions: totalResolved,
      total_resolved: totalResolved,
      current_streak: streak,
      rating_is_provisional: totalResolved < MIN_N_OVERALL,
    },
  });
}

let warn: jest.SpyInstance;

beforeEach(() => {
  seq = 0;
  __resetRevealedWeeksForTests();
  jest.mocked(haptics.reveal).mockClear();
  useStatsStore.setState({
    userStat: null,
    categoryStats: [],
    nextBadges: {},
    calibration: { rating: 0, buckets: [] },
  });
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  __setShareDepsForTests(shareDeps());
});

afterEach(() => {
  __setShareDepsForTests(null);
  warn.mockRestore();
});

describe('WrappedPanel — an empty week (roadmap step 34)', () => {
  const due = (days: number, id: string): Prediction => {
    const at = new Date();
    at.setDate(at.getDate() + days);
    at.setHours(12, 0, 0, 0);
    return { ...prediction({ id }), status: 'pending', resolved_at: null, due_date: at.toISOString() };
  };

  it('says what is on the way instead of "nothing"', () => {
    usePredictionStore.setState({
      pending: [due(2, 'soon'), due(5, 'later'), due(30, 'next-month')],
      resolved: [],
    });
    render(<WrappedPanel span="week" />);
    expect(screen.getByText('2 on the way')).toBeTruthy();
    // D76 (the voice pass, 2026-11-23).
    expect(
      screen.getByText('2 predictions come due this week. This fills in as you answer them.'),
    ).toBeTruthy();
    expect(screen.queryByText('Nothing scored yet')).toBeNull();
  });

  it('keeps the plain empty copy with nothing due this week, and for the year', () => {
    usePredictionStore.setState({ pending: [due(30, 'next-month')], resolved: [] });
    const week = render(<WrappedPanel span="week" />);
    expect(screen.getByText('Nothing scored yet')).toBeTruthy();
    // One is open, so it doesn't ask for one (playtest 2026-11-09b, finding 10).
    expect(screen.getByText('Nothing scored this week.')).toBeTruthy();
    expect(screen.queryByText(/Log a prediction/)).toBeNull();
    week.unmount();

    usePredictionStore.setState({ pending: [due(2, 'soon')], resolved: [] });
    render(<WrappedPanel span="year" />);
    expect(screen.getByText('Nothing scored yet')).toBeTruthy();
  });
});

describe('WrappedPanel', () => {
  it('tells an empty-week story instead of rendering blank', () => {
    seed([]);
    render(<WrappedPanel span="week" />);

    expect(screen.getByText('Nothing scored yet')).toBeTruthy();
    expect(screen.getByText(/Log a prediction and the story starts/)).toBeTruthy();
  });

  it('disables sharing when there is nothing to show', () => {
    seed([]);
    render(<WrappedPanel span="week" />);

    fireEvent.press(screen.getByTestId('wrapped-share-button'));
    expect(screen.queryByTestId('wrapped-share-message')).toBeNull();
  });

  it('summarizes the window in counts', () => {
    seed(run(4, 3));
    render(<WrappedPanel span="week" />);

    expect(screen.getByTestId('wrapped-stat')).toHaveTextContent(/4 scored/);
    // The category chip says what its number is, too (blind playtest
    // 2026-11-13c, finding 12): "Social 20" read as a score.
    expect(screen.getAllByText('4 scored')).toHaveLength(2);
    // Four at 80% expect 3.2; three happened (roadmap step 48).
    expect(screen.getByTestId('wrapped-expected')).toHaveTextContent(
      '3 happened. You expected about\u00A03.',
    );
    expect(screen.queryByText(/came in/)).toBeNull();
    // Read as one sentence by screen readers.
    expect(screen.getByTestId('wrapped-stat').props.accessibilityLabel).toBe(
      '4 predictions scored. 3 happened. You expected about\u00A03.',
    );
  });

  // CLAUDE.md: no verdict on data too thin to support one.
  it('withholds the calibration read while the window is provisional', () => {
    seed(run(4, 2));
    render(<WrappedPanel span="week" />);

    expect(screen.queryByTestId('wrapped-verdict')).toBeNull();
    expect(screen.getByTestId('wrapped-provisional')).toBeTruthy();
  });

  // A week almost never reaches the minimum, so it must not ask for 20
  // resolutions in seven days; it points at the overall unlock instead.
  it('shows overall progress on a provisional week while the rating is locked', () => {
    seed(run(4, 2));
    seedOverall(12);
    render(<WrappedPanel span="week" />);

    expect(screen.getByText(/12 of 20 scored answers toward your first calibration score/)).toBeTruthy();
    expect(screen.queryByText(/more answers and this/)).toBeNull();
  });

  it('points at the all-time score once the rating has unlocked', () => {
    seed(run(4, 2));
    seedOverall(MIN_N_OVERALL + 10);
    render(<WrappedPanel span="week" />);

    expect(screen.getByText(/A week is too short for a verdict/)).toBeTruthy();
  });

  it('keeps the countdown for a provisional year', () => {
    seed(run(4, 2));
    render(<WrappedPanel span="year" />);

    expect(screen.getByText(/16 more scored answers and this year earns/)).toBeTruthy();
  });

  it('gives a factual receipt from the busiest bucket, even while provisional', () => {
    seed([...run(3, 2, { confidence: 90 }), prediction({ confidence: 50 })]);
    render(<WrappedPanel span="week" />);

    expect(screen.getByTestId('wrapped-receipt')).toBeTruthy();
    expect(screen.getByText(holdRanges('You said 80–100% 3 times. 2 of 3 happened.'))).toBeTruthy();
  });

  it('gives the verdict once the window clears the minimum', () => {
    seed(run(MIN_N_OVERALL, 10));
    render(<WrappedPanel span="week" />);

    expect(screen.getByTestId('wrapped-verdict')).toBeTruthy();
    expect(screen.queryByTestId('wrapped-provisional')).toBeNull();
    expect(screen.getByText(/you ran overconfident/)).toBeTruthy();
  });

  // Decided 2026-11-03 (playtest runs 2 and 4): the week's read beside the
  // whole record's, as Insights words it.
  it("sets the whole record's read beside the week's verdict", () => {
    seed(run(MIN_N_OVERALL, 10));
    seedOverall(148);
    const band = (low: number, n: number, yes: number, stated: number, direction: 'overconfident' | 'underconfident') => ({
      low,
      high: low + 20,
      total_resolved: n,
      resolved_yes: yes,
      stated_confidence_mean: stated,
      actual_rate: yes / n,
      bucket_error: Math.abs(stated / 100 - yes / n),
      direction,
      chance_low: 0,
      chance_high: 1,
      expected_yes: (n * stated) / 100,
    });
    useStatsStore.setState({
      calibration: {
        rating: 87,
        buckets: [band(60, 40, 36, 70, 'underconfident'), band(80, 60, 39, 88, 'overconfident')],
      },
    });
    render(<WrappedPanel span="week" />);

    expect(screen.getByTestId('wrapped-all-time')).toHaveTextContent(
      holdRanges("Across all 148 scored answers, you're too sure at 80–100% and too cautious at 60–80%."),
    );
  });

  it('features the boldest call and the surest miss', () => {
    seed([
      prediction({ confidence: 95, status: 'resolved_yes', title: 'Ship the beta' }),
      prediction({ confidence: 90, status: 'resolved_no', title: 'Close the deal' }),
    ]);
    render(<WrappedPanel span="week" />);

    expect(screen.getByTestId('wrapped-boldest-hit')).toBeTruthy();
    // Titles stay off the card until the user asks for them.
    expect(screen.queryByText(/Ship the beta/)).toBeNull();
    expect(screen.queryByText(/Close the deal/)).toBeNull();

    fireEvent.press(screen.getByTestId('wrapped-titles-toggle'));
    expect(screen.getByText(/Ship the beta/)).toBeTruthy();
    expect(screen.getByText(/Close the deal/)).toBeTruthy();
  });

  // Step 179 (blind playtest 2026-11-13e, run 4): titles can't go on the card
  // while the words are hidden.
  it('offers no titles while the words are hidden', () => {
    seed([prediction({ confidence: 95, status: 'resolved_yes', title: 'Ship the beta' })]);
    useSettingsStore.setState({ hideTitles: true });
    try {
      render(<WrappedPanel span="week" />);
      expect(screen.queryByTestId('wrapped-titles-toggle')).toBeNull();
      expect(screen.queryByText(/Ship the beta/)).toBeNull();
    } finally {
      useSettingsStore.setState({ hideTitles: false });
    }
  });

  // Blind playtest 2026-11-04, run 3: Finance left off the card came back
  // on both recaps, with its next badge and, with titles on, its title.
  it("leaves off what the person left off their card, and says so", () => {
    const stat = (category: CategoryStat["category"], n: number): CategoryStat => ({
      user_id: "u1",
      category,
      predictions_made: n,
      predictions_resolved: n,
      calibration_score: 80,
      score_is_provisional: true,
      badge_level: "guesser",
    });
    useStatsStore.setState({
      categoryStats: [stat("work", 2), stat("finance", 1)],
      nextBadges: {
        work: { badge: "tracker", needResolved: 20, needScore: null },
        finance: { badge: "tracker", needResolved: 20, needScore: null },
      },
    });
    useSettingsStore.setState({ cardHiddenCategories: ["finance"] });
    seed([
      prediction({ confidence: 70, status: "resolved_yes", title: "Ship the beta" }),
      prediction({ confidence: 60, status: "resolved_yes" }),
      prediction({ category: "finance", confidence: 95, status: "resolved_no", title: "Cancel subscriptions" }),
    ]);
    render(<WrappedPanel span="week" />);

    expect(screen.getByTestId("wrapped-category-work")).toBeTruthy();
    expect(screen.queryByTestId("wrapped-category-finance")).toBeNull();
    expect(screen.getByTestId("wrapped-hidden")).toHaveTextContent("1 category not shown (still counted)");
    expect(screen.getByTestId("wrapped-next-badge")).toHaveTextContent(/^To reach Tracker or higher in work/);
    // A screen reader hears the same card (playtest 2026-11-04b, run 2).
    const spoken = () => screen.getByTestId("wrapped-card").props.accessibilityLabel as string;
    expect(spoken()).toMatch(/Tracker or higher in work/);
    expect(spoken()).toContain("By category: Work, 2 scored.");
    expect(spoken()).toContain("1 category not shown (still counted).");
    expect(spoken()).not.toMatch(/Finance/);

    fireEvent.press(screen.getByTestId("wrapped-titles-toggle"));
    expect(screen.getByText(/Ship the beta/)).toBeTruthy();
    expect(screen.queryByText(/Cancel subscriptions/)).toBeNull();
    expect(spoken()).toContain("Ship the beta");
    expect(spoken()).not.toContain("Cancel subscriptions");
    useSettingsStore.setState({ cardHiddenCategories: [] });
  });

  // Record audit and code review, 2026-11-14: a category with open
  // predictions only was never on the card, but its next badge reached the
  // recap, named, with the words hidden and every answered category off.
  it("names no category the card couldn't show in its next badge", () => {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { useCategoryStore } = require("@/store/categoryStore") as typeof import("@/store/categoryStore");
    /* eslint-enable @typescript-eslint/no-var-requires */
    const stat = (category: CategoryStat["category"], n: number): CategoryStat => ({
      user_id: "u1",
      category,
      predictions_made: n || 3,
      predictions_resolved: n,
      calibration_score: 80,
      score_is_provisional: n < 20,
      badge_level: n >= 20 ? "tracker" : "guesser",
    });
    useCategoryStore.setState({
      defs: [
        {
          id: "c-trips",
          user_id: "u1",
          name: "Trips",
          icon: null,
          hidden: false,
          position: 0,
          created_at: "2026-11-01T00:00:00.000Z",
        },
      ],
    });
    useStatsStore.setState({
      categoryStats: [stat("work", 25), stat("c-trips", 0), stat("social", 0)],
      nextBadges: {
        work: { badge: "forecaster", needResolved: 0, needScore: 72 },
        "c-trips": { badge: "tracker", needResolved: 20, needScore: null },
        social: { badge: "tracker", needResolved: 20, needScore: null },
      },
    });
    seed(run(4, 3));
    try {
      useSettingsStore.setState({ hideTitles: true });
      const view = render(<WrappedPanel span="week" />);
      const spoken = () => screen.getByTestId("wrapped-card").props.accessibilityLabel as string;
      expect(screen.queryByText(/Trips|social/)).toBeNull();
      expect(spoken()).not.toMatch(/Trips|social/);

      // Every answered category off: nothing left for the row to name.
      useSettingsStore.setState({ cardHiddenCategories: ["work"] });
      view.rerender(<WrappedPanel span="week" />);
      expect(screen.queryByTestId("wrapped-next-badge")).toBeNull();
      expect(spoken()).not.toMatch(/Trips|social/);
    } finally {
      useSettingsStore.setState({ hideTitles: false, cardHiddenCategories: [] });
      useCategoryStore.setState({ defs: [] });
    }
  });

  // Roadmap D23: the note counts calls under 40%, not a 35–65% bonus.
  it('credits calls at the unlikely end', () => {
    seed([prediction({ confidence: 20 }), prediction({ confidence: 30 })]);
    render(<WrappedPanel span="week" />);

    expect(screen.getByText(/2 calls under 40% this week/)).toBeTruthy();
  });

  it('asks for an unlikely call when there were none', () => {
    seed(run(3, 2));
    render(<WrappedPanel span="week" />);

    expect(screen.getByText(/Nothing under 40% answered this week/)).toBeTruthy();
  });

  it('captures the recap and opens the share sheet', async () => {
    const deps = shareDeps();
    __setShareDepsForTests(deps);
    seed(run(4, 3));
    render(<WrappedPanel span="week" />);

    fireEvent.press(screen.getByTestId('wrapped-share-button'));

    await waitFor(() => {
      expect(deps.share).toHaveBeenCalledWith('file:///tmp/wrapped.png');
    });
  });

  it('surfaces a hint when sharing is unavailable, without crashing', async () => {
    __setShareDepsForTests(shareDeps({ isAvailable: jest.fn(async () => false) }));
    seed(run(4, 3));
    render(<WrappedPanel span="week" />);

    fireEvent.press(screen.getByTestId('wrapped-share-button'));

    await waitFor(() => {
      expect(screen.getByText(/screenshot it instead/)).toBeTruthy();
    });
    expect(screen.getByTestId('wrapped-card')).toBeTruthy();
  });

  it('shows the badge closest to hand, with a blueprint emblem', () => {
    seed(run(4, 3));
    useStatsStore.setState({
      categoryStats: [
        {
          user_id: 'u1',
          category: 'health',
          predictions_made: 17,
          predictions_resolved: 17,
          calibration_score: 60,
          score_is_provisional: true, // under 20 (D46)
          badge_level: 'guesser',
        },
      ],
      nextBadges: { health: { badge: 'tracker', needResolved: 20, needScore: null } },
    });
    render(<WrappedPanel span="week" />);

    expect(screen.getByTestId('wrapped-next-badge')).toBeTruthy();
    expect(screen.getByText('To reach Tracker or higher in health: 3 more scored answers')).toBeTruthy();
    // The spoken label keeps the final "s" (blind playtest 2026-11-12f, run 8).
    expect(screen.getByTestId('wrapped-card').props.accessibilityLabel).toContain(
      'To reach Tracker or higher in health: 3 more scored answers.',
    );
    expect(screen.getByTestId('lens-tracker-progress', { includeHiddenElements: true })).toBeTruthy();
  });

  it('hides the badge row when there is nothing to work toward', () => {
    seed(run(4, 3));
    render(<WrappedPanel span="week" />);

    expect(screen.queryByTestId('wrapped-next-badge')).toBeNull();
  });

  it('renders the yearly window too', () => {
    seed(run(3, 2));
    render(<WrappedPanel span="year" />);

    expect(screen.getByTestId('wrapped-panel-year')).toBeTruthy();
    expect(screen.getByText('Your year in predictions')).toBeTruthy();
  });
});

// DESIGN_SYSTEM §6.2: weekly Wrapped gets `reveal`, once, on the panel.
describe('WrappedPanel — weekly reveal', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('lands with the reveal haptic once a day, not on every visit', () => {
    seed(run(4, 3));
    const first = render(<WrappedPanel span="week" />);
    jest.advanceTimersByTime(500);
    expect(haptics.reveal).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<WrappedPanel span="week" />);
    jest.advanceTimersByTime(500);
    expect(haptics.reveal).toHaveBeenCalledTimes(1);
  });

  it('does not perform for an empty week or for the year', () => {
    seed([]);
    const empty = render(<WrappedPanel span="week" />);
    jest.advanceTimersByTime(500);
    empty.unmount();

    seed(run(4, 3));
    render(<WrappedPanel span="year" />);
    jest.advanceTimersByTime(500);
    expect(haptics.reveal).not.toHaveBeenCalled();
  });
});

/**
 * One open prediction logged a day, `days` days in a row, the last of them
 * `lastDaysAgo` days ago (0 = today), due well after the week: they only
 * make the streak, as Today reads it.
 */
function loggedDaily(days: number, lastDaysAgo = 0): Prediction[] {
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    const back = lastDaysAgo + i;
    const at = new Date(now);
    at.setDate(at.getDate() - back);
    // Earlier days at noon; today at the moment itself, never later.
    if (back > 0) at.setHours(12, 0, 0, 0);
    const due = new Date(now);
    due.setDate(due.getDate() + 30);
    return prediction({
      created_at: at.toISOString(),
      due_date: due.toISOString(),
      status: 'pending',
      resolved_at: null,
    });
  });
}

// Roadmap step 63: the daily streak travels with the recap. Since the record
// audit of 2026-11-18 (R11) it is the streak as Today reads it, live from the
// predictions: the stored one waits for a write, so it outlived an ended one.
describe('WrappedPanel streak', () => {
  afterEach(() => act(() => useSettingsStore.setState({ streakShown: true })));

  it('puts a running streak on the card, and says it to a screen reader', () => {
    seed(run(4, 3));
    usePredictionStore.setState({ pending: loggedDaily(15) });
    seedOverall(30, 15);
    render(<WrappedPanel span="week" />);
    expect(screen.getByTestId('wrapped-streak')).toHaveTextContent('15-day streak');
    expect(screen.getByTestId('wrapped-card').props.accessibilityLabel).toContain(
      '15-day streak.',
    );
  });

  it('leaves it off with no streak to speak of', () => {
    // Logged three days ago, answered today: today counts, yesterday didn't,
    // so the streak is one day, too short for the card.
    seed(run(4, 3, { created_at: new Date(Date.now() - 3 * 86_400_000).toISOString() }));
    seedOverall(30, 1);
    render(<WrappedPanel span="week" />);
    expect(screen.queryByTestId('wrapped-streak')).toBeNull();
  });

  it.each(['week', 'year'] as const)(
    'leaves off a streak that has ended though the stored one says 5 (%s)',
    (span) => {
      // Five days in a row, the last ten days ago, no rest day saved: it ended
      // nine days ago, and nothing written since has recomputed the stored 5.
      seed([]);
      usePredictionStore.setState({ pending: loggedDaily(5, 10) });
      seedOverall(30, 5);
      render(<WrappedPanel span={span} />);
      expect(screen.queryByTestId('wrapped-streak')).toBeNull();
      expect(screen.getByTestId('wrapped-card').props.accessibilityLabel).not.toMatch(
        /day streak/,
      );
    },
  );

  it('shows the running streak though the stored one lags behind', () => {
    seed(run(4, 3));
    usePredictionStore.setState({ pending: loggedDaily(6) });
    seedOverall(30, 0);
    render(<WrappedPanel span="year" />);
    expect(screen.getByTestId('wrapped-streak')).toHaveTextContent('6-day streak');
  });

  it('keeps it off the recap while the streak is off in You', () => {
    seed(run(4, 3));
    usePredictionStore.setState({ pending: loggedDaily(15) });
    seedOverall(30, 15);
    useSettingsStore.setState({ streakShown: false });
    render(<WrappedPanel span="week" />);
    expect(screen.queryByTestId('wrapped-streak')).toBeNull();
    expect(screen.getByTestId('wrapped-card').props.accessibilityLabel).not.toMatch(
      /day streak/,
    );
  });
});
