import { fireEvent, render } from '@testing-library/react-native';

import { CalibrationView, skippedLine } from '@/components/stats/CalibrationView';
import { holdRanges } from '@/components/ui/holdRanges';
import type { CalibrationResult, UserStat } from '@/types';

const EMPTY_CAL: CalibrationResult = { rating: 0, buckets: [] };

const userStat = (overrides: Partial<UserStat> = {}): UserStat => ({
  user_id: 'u1',
  calibration_rating: 0,
  total_predictions: 0,
  total_resolved: 0,
  current_streak: 0,
  rating_is_provisional: true,
  ...overrides,
});

describe('CalibrationView headline', () => {
  it('shows progress-to-unlock, not a number, while provisional', () => {
    const { queryByTestId, getByTestId, getByText } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 8, calibration_rating: 91 })}
        calibration={EMPTY_CAL}
        categoryStats={[]}
        nextBadges={{}}
      />,
    );
    // The misleading raw rating must NOT be headlined…
    expect(queryByTestId('rating-value')).toBeNull();
    // …instead the remaining count (20 − 8 = 12) is shown.
    expect(getByTestId('rating-provisional')).toBeTruthy();
    expect(getByText('8 of 20 resolved')).toBeTruthy();
    expect(getByText(/12 more resolutions and your score unlocks/)).toBeTruthy();
  });

  it('headlines the rounded rating once non-provisional', () => {
    const { getByTestId, queryByTestId } = render(
      <CalibrationView
        userStat={userStat({
          total_resolved: 40,
          calibration_rating: 82.6,
          rating_is_provisional: false,
        })}
        calibration={EMPTY_CAL}
        categoryStats={[]}
        nextBadges={{}}
      />,
    );
    expect(getByTestId('rating-value').props.children).toBe(83);
    expect(queryByTestId('rating-provisional')).toBeNull();
  });
});

describe('CalibrationView — How is this scored? (roadmap step 29)', () => {
  it('offers the explainer whether or not the rating has unlocked', () => {
    for (const total_resolved of [8, 40]) {
      const onExplain = jest.fn();
      const { getByTestId, unmount } = render(
        <CalibrationView
          userStat={userStat({ total_resolved, rating_is_provisional: total_resolved < 20 })}
          calibration={EMPTY_CAL}
          categoryStats={[]}
          nextBadges={{}}
          onExplain={onExplain}
        />,
      );
      fireEvent.press(getByTestId('stats-explain'));
      expect(onExplain).toHaveBeenCalledTimes(1);
      unmount();
    }
  });
});

describe('CalibrationView — next due date while calibrating (roadmap step 35)', () => {
  it('adds it to the calibrating caption', () => {
    const { getByText } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 3, rating_is_provisional: true })}
        calibration={EMPTY_CAL}
        categoryStats={[]}
        nextBadges={{}}
        nextDue="The next one comes due Tue, Oct 6."
      />,
    );
    expect(getByText(/your score unlocks\. The next one comes due Tue, Oct 6\.$/)).toBeTruthy();
  });
});

describe('CalibrationView provisional progress', () => {
  it('counts open predictions as on their way', () => {
    const { getByText, getByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 4 })}
        calibration={EMPTY_CAL}
        categoryStats={[]}
        nextBadges={{}}
        pendingCount={3}
      />,
    );
    expect(getByText('4 of 20 resolved, 3 on their way')).toBeTruthy();
    expect(getByTestId('rating-provisional').props.accessibilityValue).toEqual({
      min: 0,
      max: 20,
      now: 4,
    });
  });
});

describe('CalibrationView chart section', () => {
  const bucket = {
    low: 80,
    high: 100,
    total_resolved: 12,
    resolved_yes: 7,
    stated_confidence_mean: 88,
    actual_rate: 7 / 12,
    bucket_error: 0.3,
    direction: 'overconfident' as const,
    chance_low: 0,
    chance_high: 1,
    expected_yes: 0,
  };

  it('titles the chart with its takeaway once the rating is unlocked', () => {
    const { getByTestId, getByText } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 25, rating_is_provisional: false })}
        calibration={{ rating: 70, buckets: [bucket] }}
        categoryStats={[]}
        nextBadges={{}}
      />,
    );
    // The range's dash is held to its numbers so it never splits (step 70).
    expect(getByTestId('chart-takeaway').props.children).toBe(
      "You're overconfident at 80\u2060–\u2060100%",
    );
    expect(getByText(holdRanges('Of 12 things you called 80–100% likely, 7 happened.'))).toBeTruthy();
  });

  it('shows coverage, and flags an unused low range', () => {
    const { getByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 12 })}
        calibration={{ rating: 70, buckets: [bucket] }}
        categoryStats={[]}
        nextBadges={{}}
      />,
    );
    expect(getByTestId('coverage-0')).toBeTruthy();
    expect(getByTestId('coverage-note')).toBeTruthy();
  });

  // Roadmap step 51: a range with predictions in it opens them in History.
  it('opens a filled range, and leaves empty ones and the Warmup inert', () => {
    const onSelectRange = jest.fn();
    const { getByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 12 })}
        calibration={{ rating: 70, buckets: [bucket] }}
        categoryStats={[]}
        nextBadges={{}}
        onSelectRange={onSelectRange}
      />,
    );
    const filled = getByTestId('coverage-80');
    expect(filled.props.accessibilityRole).toBe('button');
    expect(filled.props.accessibilityLabel).toBe('80–100%: 12 resolved. Show them.');
    // The drawn label may break after its dash, over two lines at most, rather
    // than be cut short at large text sizes (blind playtest 2026-11-01).
    const label = getByTestId('coverage-80-label');
    expect(label).toHaveTextContent('80–100%');
    expect(label.props.numberOfLines).toBe(2);
    fireEvent.press(filled);
    expect(onSelectRange).toHaveBeenCalledWith(80);

    fireEvent.press(getByTestId('coverage-0'));
    expect(onSelectRange).toHaveBeenCalledTimes(1);
    expect(getByTestId('coverage-tap-hint')).toBeTruthy();
  });

  it('keeps the cells as plain counts without a handler', () => {
    const { getByTestId, queryByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 12 })}
        calibration={{ rating: 70, buckets: [bucket] }}
        categoryStats={[]}
        nextBadges={{}}
      />,
    );
    expect(getByTestId('coverage-80').props.accessibilityRole).toBeUndefined();
    expect(queryByTestId('coverage-tap-hint')).toBeNull();
  });

  it('keeps the numbers table behind a disclosure', () => {
    const { getByTestId, queryByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 12 })}
        calibration={{ rating: 70, buckets: [bucket] }}
        categoryStats={[]}
        nextBadges={{}}
      />,
    );
    expect(queryByTestId('bucket-80')).toBeNull();
    fireEvent.press(getByTestId('chart-table-toggle'));
    expect(getByTestId('bucket-80')).toBeTruthy();
  });
});

describe('CalibrationView — the rating as one stop (roadmap step 43)', () => {
  it('reads number and label together', () => {
    const { getByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 40, rating_is_provisional: false, calibration_rating: 91.6 })}
        calibration={EMPTY_CAL}
        categoryStats={[]}
        nextBadges={{}}
      />,
    );
    expect(getByTestId('stats-rating-group').props.accessibilityLabel).toBe(
      'Calibration rating, 92 out of 100.',
    );
  });
});

// Roadmap D4: the rating's give-or-take, once the rating has unlocked.
describe('CalibrationView rating range', () => {
  it('says how far the rating could move', () => {
    const { getByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 145, rating_is_provisional: false })}
        calibration={{ rating: 92, buckets: [] }}
        categoryStats={[]}
        nextBadges={{}}
        ratingRange={{ giveOrTake: 3, low: 89, high: 95 }}
      />,
    );
    expect(getByTestId('stats-rating-range')).toHaveTextContent(
      'Give or take 3 points with this many predictions.',
    );
  });

  it('stays quiet while calibrating', () => {
    const { queryByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 12 })}
        calibration={{ rating: 70, buckets: [] }}
        categoryStats={[]}
        nextBadges={{}}
        ratingRange={{ giveOrTake: 9, low: 61, high: 79 }}
      />,
    );
    expect(queryByTestId('stats-rating-range')).toBeNull();
  });
});

// Roadmap D24: the Brier score, one quiet line, only once the rating unlocks.
describe('CalibrationView Brier score', () => {
  it('shows one line under the rating', () => {
    const { getByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 145, rating_is_provisional: false })}
        calibration={{ rating: 92, buckets: [] }}
        categoryStats={[]}
        nextBadges={{}}
        brier={0.1423}
        brierBaseline={{ rate: 0.64, score: 0.2304 }}
      />,
    );
    expect(getByTestId('stats-brier')).toHaveTextContent(
      'Brier score\u00A00.14, lower is better. Saying 64%\u00A0every time, how often your calls came true, would score\u00A00.23.',
    );
  });

  it('stays out of sight while calibrating', () => {
    const { queryByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 12 })}
        calibration={{ rating: 70, buckets: [] }}
        categoryStats={[]}
        nextBadges={{}}
        brier={0.2}
      />,
    );
    expect(queryByTestId('stats-brier')).toBeNull();
  });
});

// Roadmap D36: when a first badge can come, until one has.
describe('CalibrationView first badge', () => {
  const cat = (category: 'health' | 'work', resolved: number) => ({
    user_id: 'u1',
    category,
    predictions_made: resolved,
    predictions_resolved: resolved,
    calibration_score: 80,
    score_is_provisional: resolved < 15,
    badge_level: resolved >= 20 ? ('tracker' as const) : ('guesser' as const),
  });
  const view = (stats: ReturnType<typeof cat>[]) =>
    render(
      <CalibrationView
        userStat={userStat({ total_resolved: 1 })}
        calibration={EMPTY_CAL}
        categoryStats={stats}
        nextBadges={{}}
      />,
    );

  it('says a first badge comes at 20 answered in a category', () => {
    expect(view([]).getByTestId('badges-first')).toHaveTextContent(
      'A category earns its first badge, Tracker, at 20 answered there.',
    );
    expect(view([cat('health', 19)]).getByTestId('badges-first')).toBeTruthy();
  });

  it('stops once a category has one', () => {
    expect(view([cat('health', 19), cat('work', 20)]).queryByTestId('badges-first')).toBeNull();
  });
});

// Roadmap D34: the Can't tell answers the rating leaves out, said beside it.
describe('CalibrationView skipped answers', () => {
  it("says how many answers were Can't tell, once the rating unlocks", () => {
    const view = (skippedCount: number, total = 161) =>
      render(
        <CalibrationView
          userStat={userStat({ total_resolved: total, rating_is_provisional: total < 20 })}
          calibration={{ rating: 87, buckets: [] }}
          categoryStats={[]}
          nextBadges={{}}
          skippedCount={skippedCount}
        />,
      );
    expect(view(2).getByTestId('stats-skipped')).toHaveTextContent(
      '2 of 163 answers were Can’t tell, so they aren’t scored.',
    );
    expect(view(0).queryByTestId('stats-skipped')).toBeNull();
    expect(view(3, 12).queryByTestId('stats-skipped')).toBeNull();
  });

  it('words one', () => {
    expect(skippedLine(1, 40)).toBe('1 of 41 answers was Can’t tell, so it isn’t scored.');
  });
});

// Roadmap D4: each range as dots, with the expected count marked.
describe('CalibrationView counts', () => {
  it('shows each range as dots with the expected count beside the outcome', () => {
    const range = {
      low: 60,
      high: 80,
      total_resolved: 12,
      resolved_yes: 10,
      stated_confidence_mean: 70,
      actual_rate: 10 / 12,
      bucket_error: 0.13,
      direction: 'underconfident' as const,
      chance_low: 0.58,
      chance_high: 0.75,
      expected_yes: 8.4,
    };
    const { getByTestId, getByText } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 12 })}
        calibration={{ rating: 87, buckets: [range] }}
        categoryStats={[]}
        nextBadges={{}}
      />,
    );
    fireEvent.press(getByTestId('chart-table-toggle'));
    expect(getByText('Hide the counts')).toBeTruthy();
    expect(getByTestId('bucket-60-expected')).toHaveTextContent(
      '10 of 12 happened; your numbers expected about 8.',
    );
    expect(getByTestId('bucket-60-dots', { includeHiddenElements: true })).toBeTruthy();
  });
});

// Roadmap D37: the pattern named plainly, and the change since last week.
describe('CalibrationView pattern lines', () => {
  it('names the area furthest off and the change since last week', () => {
    const { getByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 145, rating_is_provisional: false })}
        calibration={{ rating: 87, buckets: [] }}
        categoryStats={[]}
        nextBadges={{}}
        ratingRange={{ giveOrTake: 3, low: 84, high: 90 }}
        furthestOff={{
          category: 'finance',
          resolved: 18,
          happened: 8,
          mean_stated: 85,
          actual_rate: 8 / 18,
          direction: 'overconfident',
        }}
        weekChange={{ before: 85, now: 87, answered: 6 }}
      />,
    );
    expect(getByTestId('stats-furthest-off')).toHaveTextContent(
      'Furthest off: finance. You said about 85%, and 8 of 18 happened. About 45% would have matched.',
    );
    expect(getByTestId('stats-week-change')).toHaveTextContent(
      'Up 2 since last week, from 6 answers, within its give\u2060-\u2060or\u2060-\u2060take.',
    );
  });
});
