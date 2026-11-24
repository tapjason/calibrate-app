import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, type TextStyle } from 'react-native';

import {
  CalibrationView,
  deletedLine,
  postponedLine,
  refiledLine,
  sameDayLine,
  skippedLine,
} from '@/components/stats/CalibrationView';
import { holdRanges } from '@/components/ui/holdRanges';
import { colors, space, type } from '@/constants/theme';
import { useCategoryStore } from '@/store/categoryStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { CalibrationResult, Category, CategoryStat, Prediction, UserStat } from '@/types';
import { MIN_N_CATEGORY } from '@/types';

const EMPTY_CAL: CalibrationResult = { rating: 0, buckets: [] };

/**
 * One prediction logged a day, `days` days in a row, the last of them
 * `lastDaysAgo` days before `now` (0 = today). Open, due well after: only
 * the days they were logged matter to the streak.
 */
function loggedDaily(days: number, lastDaysAgo = 0, now = new Date()): Prediction[] {
  return Array.from({ length: days }, (_, i) => {
    const back = lastDaysAgo + i;
    const at = new Date(now);
    at.setDate(at.getDate() - back);
    // Earlier days at noon; today at the moment itself, never later.
    if (back > 0) at.setHours(12, 0, 0, 0);
    const due = new Date(now);
    due.setDate(due.getDate() + 30);
    return {
      id: `daily-${back}`,
      user_id: 'u1',
      title: `Logged ${back} days ago`,
      category: 'work',
      confidence: 70,
      created_at: at.toISOString(),
      due_date: due.toISOString(),
      status: 'pending',
      resolved_at: null,
      reflection: null,
      integrity_bonus: false,
    };
  });
}

const userStat = (overrides: Partial<UserStat> = {}): UserStat => ({
  user_id: 'u1',
  calibration_rating: 0,
  total_predictions: 0,
  total_resolved: 0,
  current_streak: 0,
  rating_is_provisional: true,
  ...overrides,
});

/** Opens "More about your record", where the fine print lives (D62). */
function fine<T extends ReturnType<typeof render>>(view: T): T {
  const toggle = view.queryByTestId('stats-fine-toggle');
  if (toggle) fireEvent.press(toggle);
  return view;
}

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
    // …instead the remaining count (20 − 8 = 12) is shown, in UnlockProgress's
    // one line (D76).
    expect(getByTestId('rating-provisional')).toBeTruthy();
    expect(getByText(/12 more scored answers unlock your score/)).toBeTruthy();
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

// Roadmap step 29; D76: one link, "What does this mean?", with the rating.
describe('CalibrationView — What does this mean?', () => {
  it('offers the explainer whether or not the rating has unlocked', () => {
    for (const total_resolved of [8, 40]) {
      const onExplain = jest.fn();
      const { getByTestId, getAllByRole, queryByText, unmount } = render(
        <CalibrationView
          userStat={userStat({ total_resolved, rating_is_provisional: total_resolved < 20 })}
          calibration={EMPTY_CAL}
          categoryStats={[]}
          nextBadges={{}}
          onExplain={onExplain}
        />,
      );
      expect(getByTestId('stats-explain')).toHaveTextContent('What does this mean?');
      expect(getByTestId('stats-explain').props.accessibilityRole).toBe('button');
      expect(getByTestId('stats-explain').props.accessibilityHint).toBe('Opens How scoring works');
      // One way to the explanation, not two.
      expect(getAllByRole('button', { name: /What does this mean\?|How is this scored\?/ })).toHaveLength(1);
      expect(queryByText('How is this scored?')).toBeNull();
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
    expect(getByText(/unlock your score\. The next one comes due Tue, Oct 6\.$/)).toBeTruthy();
  });
});

describe('CalibrationView provisional progress', () => {
  // Since D76 the bar alone draws the ones on their way (UnlockProgress).
  it('counts open predictions as on their way', () => {
    const { getByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 4 })}
        calibration={EMPTY_CAL}
        categoryStats={[]}
        nextBadges={{}}
        pendingCount={3}
      />,
    );
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
      'You’re overconfident at 80\u2060–\u2060100%',
    );
    // Roadmap D57: what would have matched, for a range that leans; the
    // counts in D76's words.
    expect(
      getByText(
        holdRanges(
          'You called 12 things 80–100% likely. 7 happened. You said about 88%; about 60% would have matched.',
        ),
      ),
    ).toBeTruthy();
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
    // D76's words.
    expect(getByTestId('coverage-note')).toHaveTextContent(
      'No scored answers under 40% yet, so your score doesn’t cover things you thought were unlikely.',
    );
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
    expect(filled.props.accessibilityLabel).toBe('80–100%: 12 scored. Show them.');
    // The drawn label may break after its dash, and once more if a cell is too
    // narrow even for "100%", rather than be cut short at large text sizes
    // (blind playtests 2026-11-01 and 2026-11-08).
    const label = getByTestId('coverage-80-label');
    expect(label).toHaveTextContent('80–100%');
    expect(label.props.numberOfLines).toBe(3);
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

// Roadmap D4: the rating's give-or-take, once the rating has unlocked. Since
// D76 the bar draws it and the rating speaks it; its sentence is in How
// scoring works.
describe('CalibrationView rating range', () => {
  it('draws how far the rating could move, and says it to a screen reader', () => {
    const { getByTestId, queryByTestId, queryByText } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 145, rating_is_provisional: false, calibration_rating: 92 })}
        calibration={{ rating: 92, buckets: [] }}
        categoryStats={[]}
        nextBadges={{}}
        ratingRange={{ giveOrTake: 3, low: 89, high: 95 }}
      />,
    );
    expect(queryByTestId('stats-rating-range')).toBeNull();
    expect(queryByText(/Give or take 3 points/)).toBeNull();
    expect(getByTestId('stats-score-bar-range', { includeHiddenElements: true })).toBeTruthy();
    expect(getByTestId('stats-rating-group').props.accessibilityLabel).toBe(
      'Calibration rating, 92 out of 100, give or take 3.',
    );
  });

  it('speaks no give-or-take when it is 0', () => {
    const { getByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 145, rating_is_provisional: false, calibration_rating: 92 })}
        calibration={{ rating: 92, buckets: [] }}
        categoryStats={[]}
        nextBadges={{}}
        ratingRange={{ giveOrTake: 0, low: 92, high: 92 }}
      />,
    );
    expect(getByTestId('stats-rating-group').props.accessibilityLabel).toBe(
      'Calibration rating, 92 out of 100.',
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
  it('shows one line under the rating, in the fine print', () => {
    const { getByTestId, queryByTestId } = fine(render(
      <CalibrationView
        userStat={userStat({ total_resolved: 145, rating_is_provisional: false })}
        calibration={{ rating: 92, buckets: [] }}
        categoryStats={[]}
        nextBadges={{}}
        brier={0.1423}
        brierBaseline={{ rate: 0.64, score: 0.2304 }}
      />,
    ));
    expect(queryByTestId('stats-fine-toggle')).toHaveTextContent('Show less');
    expect(getByTestId('stats-brier')).toHaveTextContent(
      'Brier score\u00A00.14, lower is better. Saying 64%\u00A0every time, how often your calls came true, would score\u00A00.23.',
    );
  });

  it('waits for 50 scored answers (D62)', () => {
    const { queryByTestId } = fine(render(
      <CalibrationView
        userStat={userStat({ total_resolved: 49, rating_is_provisional: false })}
        calibration={{ rating: 88, buckets: [] }}
        categoryStats={[]}
        nextBadges={{}}
        brier={0.2}
        brierBaseline={{ rate: 0.64, score: 0.2304 }}
      />,
    ));
    expect(queryByTestId('stats-brier')).toBeNull();
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
    score_is_provisional: resolved < MIN_N_CATEGORY,
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
    // D76's words.
    expect(view([]).getByTestId('badges-first')).toHaveTextContent(
      'Each category earns its first badge at 20 scored answers.',
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
    const view = (skippedCount: number, total = 161, answered = total + skippedCount) =>
      fine(render(
        <CalibrationView
          userStat={userStat({ total_resolved: total, rating_is_provisional: total < 20 })}
          calibration={{ rating: 87, buckets: [] }}
          categoryStats={[]}
          nextBadges={{}}
          skippedCount={skippedCount}
          answeredCount={answered}
        />,
      ));
    expect(view(2).getByTestId('stats-skipped')).toHaveTextContent(
      '2 answers are Can’t tell, so they aren’t scored.',
    );
    // Roadmap D57: at zero too, so a sceptic needn't count rows.
    expect(view(0).getByTestId('stats-skipped')).toHaveTextContent('No answers are Can’t tell.');
    // Step 173: from the first answer, not only once unlocked, so skipping
    // every miss while it calibrates shows.
    expect(view(3, 12).getByTestId('stats-skipped')).toHaveTextContent(
      '3 answers are Can’t tell, so they aren’t scored.',
    );
    // A skip alone counts as an answer.
    expect(view(1, 0, 1).getByTestId('stats-skipped')).toHaveTextContent(
      '1 answer is Can’t tell, so it isn’t scored.',
    );
    // Nothing answered yet: no line.
    expect(view(0, 0, 0).queryByTestId('stats-skipped')).toBeNull();
  });

  it('words one', () => {
    expect(skippedLine(1)).toBe('1 answer is Can’t tell, so it isn’t scored.');
  });
});

// Roadmap D41: answers given the day they were logged, said beside the rating.
describe('CalibrationView same-day answers', () => {
  const view = (sameDayCount: number, total: number) =>
    fine(render(
      <CalibrationView
        userStat={userStat({ total_resolved: total, rating_is_provisional: total < 20 })}
        calibration={{ rating: 87, buckets: [] }}
        categoryStats={[]}
        nextBadges={{}}
        sameDayCount={sameDayCount}
      />,
    ));

  it('says how many, before the rating unlocks too', () => {
    expect(view(3, 161).getByTestId('stats-same-day')).toHaveTextContent(
      '3 answers came the day they were logged, so they aren’t scored.',
    );
    expect(view(2, 4).getByTestId('stats-same-day')).toBeTruthy();
    expect(view(0, 161).queryByTestId('stats-same-day')).toBeNull();
  });

  it('words one', () => {
    expect(sameDayLine(1)).toBe('1 answer came the day it was logged, so it isn’t scored.');
  });
});

// Roadmap D45: counted deletions, said beside the rating. Since review round 7
// an open one is counted on any day after the day it was logged, not only
// within a day of its due day, so the line names each case the store counts.
describe('CalibrationView deleted predictions', () => {
  const view = (deletedCount: number, total: number) =>
    fine(render(
      <CalibrationView
        userStat={userStat({ total_resolved: total, rating_is_provisional: total < 20 })}
        calibration={{ rating: 87, buckets: [] }}
        categoryStats={[]}
        nextBadges={{}}
        deletedCount={deletedCount}
      />,
    ));

  it('says how many, and that only this phone keeps the count, before the rating unlocks too', () => {
    expect(view(2, 161).getByTestId('stats-deleted')).toHaveTextContent(
      '2 predictions were deleted after they were answered, after the day they were logged, or once they were due. Only this phone keeps this count.',
    );
    expect(view(1, 4).getByTestId('stats-deleted')).toBeTruthy();
    expect(view(0, 161).queryByTestId('stats-deleted')).toBeNull();
  });

  it('words one', () => {
    expect(deletedLine(1)).toBe(
      '1 prediction was deleted after it was answered, after the day it was logged, or once it was due. Only this phone keeps this count.',
    );
  });

  // The old rule's words are gone: a call deleted days before its due day is
  // counted too (round 7), so "within a day of its due day" was untrue of it.
  it('no longer limits the count to the days around the due day', () => {
    for (const n of [1, 3]) {
      expect(deletedLine(n)).not.toMatch(/within a day of/);
      expect(deletedLine(n)).toMatch(/Only this phone keeps this count\.$/);
    }
    expect(deletedLine(3)).toMatch(/^3 predictions were deleted /);
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
    // One phrasing for an expected count, the chart title's (D57): 8.4 is "8 or 9".
    expect(getByTestId('bucket-60-expected')).toHaveTextContent(
      '10 of 12 happened; your numbers expected 8 or 9.',
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
          resolved: 21,
          happened: 9,
          mean_stated: 85,
          actual_rate: 9 / 21,
          direction: 'overconfident',
        }}
        weekChange={{ before: 83, now: 87, answered: 6 }}
      />,
    );
    // D76: the page keeps what was said and what happened, and the news, a
    // change beyond the give-or-take of 3 (record audit 2026-11-23).
    expect(getByTestId('stats-furthest-off')).toHaveTextContent(
      'Furthest off: Finance. You said about 85%, and 9 of 21 happened.',
    );
    expect(getByTestId('stats-week-change')).toHaveTextContent('Up 4 since last week.');
  });

  // D76: what would have matched unfolds in place under the line, as "More
  // about your record" does, and folds again.
  it('keeps what would have matched behind a tap on the furthest-off line', () => {
    const { getByTestId, queryByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 145, rating_is_provisional: false })}
        calibration={{ rating: 87, buckets: [] }}
        categoryStats={[]}
        nextBadges={{}}
        furthestOff={{
          category: 'finance',
          resolved: 21,
          happened: 9,
          mean_stated: 85,
          actual_rate: 9 / 21,
          direction: 'overconfident',
        }}
      />,
    );
    const toggle = getByTestId('stats-furthest-off-toggle');
    expect(toggle.props.accessibilityRole).toBe('button');
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    expect(queryByTestId('stats-furthest-off-detail')).toBeNull();
    expect(toggle.props.accessibilityLabel).toMatch(/^Furthest off: Finance\./);
    expect(toggle.props.accessibilityLabel).not.toMatch(/would have matched/);

    fireEvent.press(toggle);
    expect(getByTestId('stats-furthest-off-toggle').props.accessibilityState).toEqual({ expanded: true });
    // The open row keeps its first line as its name, and the expanded state
    // says it is open; the detail is read once, on its own (code review
    // 2026-11-23: it was in the label and its own Text, so read twice).
    expect(getByTestId('stats-furthest-off-toggle').props.accessibilityLabel).toBe(
      'Furthest off: Finance. You said about 85%, and 9 of 21 happened.',
    );
    expect(getByTestId('stats-furthest-off-detail')).toHaveTextContent('About 45% would have matched.');
    // Not inside the button, and not hidden: a screen reader reaches it.
    expect(getByTestId('stats-furthest-off-detail').props.accessibilityElementsHidden).toBeUndefined();
    expect(
      getByTestId('stats-furthest-off-toggle').findAll(
        (n: { props: { testID?: string } }) => n.props.testID === 'stats-furthest-off-detail',
      ),
    ).toHaveLength(0);

    fireEvent.press(getByTestId('stats-furthest-off-toggle'));
    expect(queryByTestId('stats-furthest-off-detail')).toBeNull();
  });

  // Blind playtest 2026-11-12d, run 2: a rename left the old name here until
  // something else redrew Insights.
  it('shows a new name for the furthest-off category at once', () => {
    const before = useCategoryStore.getState().defs;
    const { getByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 145, rating_is_provisional: false })}
        calibration={{ rating: 87, buckets: [] }}
        categoryStats={[]}
        nextBadges={{}}
        furthestOff={{
          category: 'finance',
          resolved: 21,
          happened: 9,
          mean_stated: 85,
          actual_rate: 9 / 21,
          direction: 'overconfident',
        }}
      />,
    );
    act(() => {
      useCategoryStore.setState({
        defs: [
          {
            id: 'finance',
            user_id: 'u1',
            name: 'Markets',
            icon: null,
            hidden: false,
            position: 0,
            created_at: '2026-11-01T00:00:00.000Z',
          },
        ],
      });
    });
    expect(getByTestId('stats-furthest-off')).toHaveTextContent(/^Furthest off: Markets\./);
    act(() => useCategoryStore.setState({ defs: before }));
  });
});


// Step 173: Insights' additions.
describe('CalibrationView step 173', () => {
  const cat = (category: Category, resolved: number, over: Partial<CategoryStat> = {}): CategoryStat => ({
    user_id: 'u1',
    category,
    predictions_made: resolved,
    predictions_resolved: resolved,
    calibration_score: 80,
    score_is_provisional: resolved < MIN_N_CATEGORY,
    badge_level: resolved >= 20 ? 'forecaster' : 'guesser',
    ...over,
  });
  const unlocked = userStat({ total_resolved: 73, rating_is_provisional: false, calibration_rating: 86 });

  // D76: in fewer words; the full line is in How scoring works.
  it('says what the rating means in points', () => {
    const { getByTestId } = render(
      <CalibrationView userStat={unlocked} calibration={{ rating: 86, buckets: [] }} categoryStats={[]} nextBadges={{}} />,
    );
    expect(getByTestId('stats-rating-meaning')).toHaveTextContent('On average you’re about 14 points off.');
  });

  it('says why there is no badge when the answers are spread thin', () => {
    const spread = (['work', 'health', 'finance', 'social', 'personal'] as Category[]).map((c) => cat(c, c === 'work' ? 33 - 19 : 14 + (c === 'health' ? 1 : 0)));
    const total = spread.reduce((n, c) => n + c.predictions_resolved, 0);
    const { getByTestId, queryByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: total, rating_is_provisional: false, calibration_rating: 86 })}
        calibration={{ rating: 86, buckets: [] }}
        categoryStats={spread}
        nextBadges={{}}
      />,
    );
    expect(getByTestId('badges-spread')).toHaveTextContent(
      `Badges need 20 scored answers in one category. Your ${total} are spread over 5, so none is there yet.`,
    );
    expect(queryByTestId('badges-first')).toBeNull();
  });

  // A category change from the eve is counted on the same line (D69 (e)).
  it('counts late due-date moves on this phone', () => {
    expect(postponedLine(1)).toBe(
      '1 prediction had its due date moved later, its words changed, or its category changed, within a day of its due day. Only this phone keeps this count.',
    );
    expect(postponedLine(2)).toBe(
      '2 predictions had their due dates moved later, their words changed, or their categories changed, within a day of their due day. Only this phone keeps this count.',
    );
    const view = fine(render(
      <CalibrationView userStat={unlocked} calibration={{ rating: 86, buckets: [] }} categoryStats={[]} nextBadges={{}} postponedCount={2} />,
    ));
    expect(view.getByTestId('stats-postponed')).toHaveTextContent(postponedLine(2));
    expect(view.getByTestId('stats-postponed')).toHaveTextContent(/^2 predictions had their due dates moved later/);
    view.rerender(
      <CalibrationView userStat={unlocked} calibration={{ rating: 86, buckets: [] }} categoryStats={[]} nextBadges={{}} />,
    );
    expect(view.queryByTestId('stats-postponed')).toBeNull();
  });

  // Step 184 (D65). Review round 6: a move before the answer is counted on
  // the same line (answered in another category than the one it had at its
  // first move after the day it was made), so the line says before or after.
  it('counts scored answers moved to another category on this phone', () => {
    expect(refiledLine(1)).toBe(
      '1 scored answer was moved to another category, before or after it was answered. Only this phone keeps this count.',
    );
    expect(refiledLine(2)).toBe(
      '2 scored answers were moved to another category, before or after they were answered. Only this phone keeps this count.',
    );
    // Not "after it was answered" alone, which a move before the answer belied.
    expect(refiledLine(1)).not.toMatch(/category after it was answered/);
    const view = fine(render(
      <CalibrationView userStat={unlocked} calibration={{ rating: 86, buckets: [] }} categoryStats={[]} nextBadges={{}} refiledCount={3} />,
    ));
    expect(view.getByTestId('stats-refiled')).toHaveTextContent(
      '3 scored answers were moved to another category, before or after they were answered. Only this phone keeps this count.',
    );
    view.rerender(
      <CalibrationView userStat={unlocked} calibration={{ rating: 86, buckets: [] }} categoryStats={[]} nextBadges={{}} />,
    );
    expect(view.queryByTestId('stats-refiled')).toBeNull();
  });

  // Behind the tap since D76.
  it('ties the furthest-off line to that category’s badge', () => {
    const { getByTestId } = render(
      <CalibrationView
        userStat={unlocked}
        calibration={{ rating: 86, buckets: [] }}
        categoryStats={[cat('health', 22, { calibration_score: 80.4 })]}
        nextBadges={{}}
        categoryRanges={{ health: { giveOrTake: 6, low: 74, high: 86 } }}
        furthestOff={{ category: 'health', resolved: 22, happened: 15, mean_stated: 88, actual_rate: 15 / 22, direction: 'overconfident' }}
      />,
    );
    expect(getByTestId('stats-furthest-off')).not.toHaveTextContent(/That gap/);
    fireEvent.press(getByTestId('stats-furthest-off-toggle'));
    expect(getByTestId('stats-furthest-off-detail')).toHaveTextContent(
      "About 70% would have matched. That gap is already in its score, 80, which still clears Forecaster's 70 at its low end.",
    );
  });
});

// D62 (blind playtest 2026-11-13d, findings 1 and 4). Since D76 the full
// line is in How scoring works; the page keeps one short line, and only
// where the full one said the score can't be told apart from perfect.
describe('CalibrationView, what luck alone gives', () => {
  /** A range of 12 at 80–100% that leans too sure (by the engine's rule). */
  const leaning = {
    low: 80,
    high: 100,
    total_resolved: 12,
    resolved_yes: 7,
    stated_confidence_mean: 88,
    actual_rate: 7 / 12,
    bucket_error: 0.3,
    direction: 'overconfident' as const,
    chance_low: 0.7,
    chance_high: 1,
    expected_yes: 10.6,
  };
  const view = (rating: number, buckets: (typeof leaning)[] = []) =>
    render(
      <CalibrationView
        userStat={userStat({ total_resolved: 20, rating_is_provisional: false, calibration_rating: rating })}
        calibration={{ rating, buckets }}
        categoryStats={[]}
        nextBadges={{}}
        perfect={{ typical: 86, low: 80, high: 91 }}
      />,
    );

  it('says it is about as good as anyone can tell, where it can’t be told apart', () => {
    view(85);
    expect(screen.getByTestId('stats-perfect')).toHaveTextContent(
      'With 20 answers, that’s about as good as anyone can tell.',
    );
    expect(screen.queryByText(/Even perfectly calibrated/)).toBeNull();
  });

  it('says nothing on the page in the other three cases', () => {
    // Above the range.
    view(95);
    expect(screen.queryByTestId('stats-perfect')).toBeNull();
    screen.unmount();
    // Within luck, while the chart names a lean.
    view(85, [leaning]);
    expect(screen.getByTestId('chart-takeaway').props.children).toMatch(/overconfident/);
    expect(screen.queryByTestId('stats-perfect')).toBeNull();
    screen.unmount();
    // Further off than luck, with a lean; and below it with none.
    view(72, [leaning]);
    expect(screen.queryByTestId('stats-perfect')).toBeNull();
    screen.unmount();
    view(72);
    expect(screen.queryByTestId('stats-perfect')).toBeNull();
    expect(screen.queryByText(/Even perfectly calibrated/)).toBeNull();
  });

  it('gives a first look in plain counts from 10 scored answers', () => {
    const { getByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 12 })}
        calibration={EMPTY_CAL}
        categoryStats={[]}
        nextBadges={{}}
        overallCounts={{ resolved: 12, happened: 6, mean_stated: 75 }}
      />,
    );
    expect(getByTestId('rating-provisional-first-look')).toHaveTextContent(
      'First look: you said about 75%, and 6 of your 12 scored predictions happened. Too early to rate.',
    );
  });
});

// Step 179 (blind playtest 2026-11-13e, runs 1 and 4): Insights' rows don't
// name a category the person named while the words are hidden.
describe('CalibrationView with the words hidden', () => {
  it('reads "Your own category" on its badge row', () => {
    const { useSettingsStore } = jest.requireActual('@/store/settingsStore') as typeof import('@/store/settingsStore');
    useCategoryStore.setState({
      defs: [
        {
          id: 'c-divorce' as Category,
          user_id: 'u1',
          name: 'Divorce',
          icon: null,
          hidden: false,
          position: 0,
          created_at: '2026-11-01T00:00:00.000Z',
        },
      ],
    });
    useSettingsStore.setState({ hideTitles: true });
    try {
      const view = render(
        <CalibrationView
          userStat={userStat({ total_resolved: 3 })}
          calibration={EMPTY_CAL}
          categoryStats={[
            {
              user_id: 'u1',
              category: 'c-divorce' as Category,
              predictions_made: 3,
              predictions_resolved: 3,
              calibration_score: 80,
              score_is_provisional: true,
              badge_level: 'guesser',
            },
          ]}
          nextBadges={{}}
        />,
      );
      expect(view.queryByText(/Divorce/)).toBeNull();
      expect(view.getAllByText(/Your own category/).length).toBeGreaterThan(0);
    } finally {
      useSettingsStore.setState({ hideTitles: false });
      useCategoryStore.setState({ defs: [] });
    }
  });
});

/// D68 (Insights A): the six equal lines under the rating, "a wall" in five
// playtest rounds, became three groups, 12 apart and 4 within, with what the
// number means as their lead. D76 (the owner's voice pass, 2026-11-23) took
// the explanations off the page: one short line, "What does this mean?", the
// week's news and the count; the rest is on top of How scoring works.
describe('CalibrationView, the lines under the rating in groups (D68, D76)', () => {
  type Shown = { range?: boolean; week?: boolean; perfect?: boolean; rating?: number };
  const unlocked = (rating: number) =>
    userStat({
      total_resolved: 153,
      rating_is_provisional: false,
      calibration_rating: rating,
      current_streak: 9,
    });
  // At 86 the rating sits inside perfect calibration's middle 80% and the
  // chart names no lean, so the short perfect line shows.
  const show = ({ range = true, week = true, perfect = true, rating = 86 }: Shown = {}) =>
    render(
      <CalibrationView
        userStat={unlocked(rating)}
        calibration={{ rating, buckets: [] }}
        categoryStats={[]}
        nextBadges={{}}
        ratingRange={range ? { giveOrTake: 3, low: rating - 3, high: rating + 3 } : null}
        weekChange={week ? { before: 84, now: 86, answered: 6 } : null}
        perfect={perfect ? { typical: 88, low: 84, high: 91 } : null}
        answeredCount={160}
        onExplain={() => {}}
      />,
    );
  const style = (id: string): TextStyle => StyleSheet.flatten(screen.getByTestId(id).props.style);
  // The count has no testID of its own: found by its words.
  const countStyle = (): TextStyle =>
    StyleSheet.flatten(screen.getByText(/^153 scored/).props.style);
  const quiet = (s: TextStyle) => {
    expect(s.fontSize).toBe(type.footnote.fontSize);
    expect(s.lineHeight).toBe(type.footnote.lineHeight);
    expect(s.fontWeight).toBe(type.footnote.fontWeight);
    expect(s.color).toEqual(colors.textSecondary);
  };

  /** Every line under the rating, and the rows around them, in render order. */
  function renderOrder(): string[] {
    const watched = new Set([
      'stats-rating-group',
      'stats-score-bar',
      'stats-rating-meaning',
      'stats-perfect',
      'stats-rating-range',
      'stats-week-change',
      'stats-fine-toggle',
      'stats-explain',
      'chart-takeaway',
    ]);
    type Node = { type?: string; props?: { testID?: string }; children?: Node[] | null } | string;
    const textOf = (n: Node): string =>
      typeof n === 'string' ? n : (n.children ?? []).map(textOf).join('');
    const out: string[] = [];
    const walk = (n: Node | Node[] | null): void => {
      if (n === null || typeof n === 'string') return;
      if (Array.isArray(n)) return n.forEach(walk);
      const id = n.props?.testID;
      if (id && watched.has(id)) out.push(id);
      else if (!id && n.type === 'Text' && /^153 scored/.test(textOf(n))) out.push('count');
      (n.children ?? []).forEach(walk);
    };
    walk(screen.toJSON() as Node | Node[] | null);
    return out;
  }

  it('says the short lines, and no longer the long ones', () => {
    show();
    expect(screen.getByTestId('stats-rating-meaning')).toHaveTextContent(
      'On average you’re about 14 points off.',
    );
    expect(screen.getByTestId('stats-perfect')).toHaveTextContent(
      'With 153 answers, that’s about as good as anyone can tell.',
    );
    // 84 to 86 is within the give-or-take of 3 (record audit 2026-11-23).
    expect(screen.getByTestId('stats-week-change')).toHaveTextContent('About the same as last week.');
    expect(screen.getByTestId('stats-explain')).toHaveTextContent('What does this mean?');
    // Each in full on top of How scoring works (ratingDetailLines), not here.
    for (const gone of [
      /Range by range/,
      /Even perfectly calibrated/,
      /can’t be told apart/,
      /Give or take 3 points/,
      /answers given since then/,
      /give⁠-⁠or⁠-⁠take/,
    ]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(screen.queryByTestId('stats-rating-range')).toBeNull();
  });

  it('leads with what the number means, a step up and in ink', () => {
    show();
    const lead = style('stats-rating-meaning');
    expect(lead.fontSize).toBe(type.subhead.fontSize);
    expect(lead.lineHeight).toBe(type.subhead.lineHeight);
    expect(lead.fontWeight).toBe(type.subhead.fontWeight);
    expect(lead.fontFamily).toBe(type.subhead.fontFamily);
    expect(lead.color).toEqual(colors.textPrimary);
    // Scales with Dynamic Type as its neighbours do: no cap of its own.
    expect(screen.getByTestId('stats-rating-meaning').props.maxFontSizeMultiplier).toBeUndefined();
    expect(screen.getByTestId('stats-perfect').props.maxFontSizeMultiplier).toBeUndefined();
  });

  it('keeps the other lines quiet', () => {
    show();
    quiet(style('stats-perfect'));
    quiet(style('stats-week-change'));
    quiet(countStyle());
  });

  it('sets 12 before each group and 4 within, with every line shown', () => {
    show();
    // What the number means: the lead, then the short perfect line, then the
    // way to the rest.
    expect(style('stats-rating-meaning').marginTop).toBe(space.md);
    expect(style('stats-perfect').marginTop).toBe(space.xs);
    expect(style('stats-explain').marginTop).toBe(space.sm);
    // The week's news.
    expect(style('stats-week-change').marginTop).toBe(space.md);
    // The count.
    expect(countStyle().marginTop).toBe(space.md);
    expect([space.md, space.xs]).toEqual([12, 4]);
  });

  it('closes up when there is no week change', () => {
    show({ week: false });
    expect(screen.queryByTestId('stats-week-change')).toBeNull();
    expect(countStyle().marginTop).toBe(space.md);
  });

  it('keeps the link under the lead without the perfect line', () => {
    show({ perfect: false });
    expect(screen.queryByTestId('stats-perfect')).toBeNull();
    expect(style('stats-rating-meaning').marginTop).toBe(space.md);
    expect(style('stats-explain').marginTop).toBe(space.sm);
    expect(style('stats-week-change').marginTop).toBe(space.md);
  });

  it('shows the week change as news without a give-or-take', () => {
    show({ range: false });
    expect(screen.getByTestId('stats-week-change')).toHaveTextContent('Up 2 since last week.');
    expect(style('stats-week-change').marginTop).toBe(space.md);
    expect(countStyle().marginTop).toBe(space.md);
  });

  it('puts the link with the rating, before the news and the count', () => {
    show();
    expect(renderOrder()).toEqual([
      'stats-rating-group',
      'stats-score-bar',
      'stats-rating-meaning',
      'stats-perfect',
      'stats-explain',
      'stats-week-change',
      'count',
      'stats-fine-toggle',
      'chart-takeaway',
    ]);
  });

  it('styles the other wording at 100 the same way', () => {
    show({ rating: 100 });
    expect(screen.getByTestId('stats-rating-meaning')).toHaveTextContent(
      'Your numbers match what happened.',
    );
    expect(style('stats-rating-meaning').fontSize).toBe(type.subhead.fontSize);
    expect(style('stats-rating-meaning').color).toEqual(colors.textPrimary);
    expect(style('stats-rating-meaning').marginTop).toBe(space.md);
  });

  it('spaces the count the same with the streak hidden in You', () => {
    // The streak beside the count is the live one (record audit, 2026-11-18):
    // nine days logged in a row, ending today, as the stored 9 says.
    usePredictionStore.setState({ pending: loggedDaily(9), resolved: [] });
    useSettingsStore.setState({ streakShown: false });
    try {
      show();
      expect(screen.getByText(/^153 scored$/)).toBeTruthy();
      quiet(countStyle());
      expect(countStyle().marginTop).toBe(space.md);
    } finally {
      act(() => useSettingsStore.setState({ streakShown: true }));
    }
    try {
      expect(screen.getByText(/^153 scored/)).toHaveTextContent('153 scored, 9-day streak');
      expect(countStyle().marginTop).toBe(space.md);
    } finally {
      usePredictionStore.setState({ pending: [], resolved: [] });
    }
  });

  it('is unchanged with the words hidden', () => {
    useSettingsStore.setState({ hideTitles: true });
    try {
      show();
      expect(style('stats-rating-meaning').color).toEqual(colors.textPrimary);
      expect(style('stats-week-change').marginTop).toBe(space.md);
      expect(countStyle().marginTop).toBe(space.md);
    } finally {
      act(() => useSettingsStore.setState({ hideTitles: false }));
    }
  });

  // Record audit, 2026-11-18 (R11): the count line read the stored streak,
  // which waits for a write, so it outlived a streak Today showed as ended.
  describe('the streak beside the count, as Today reads it', () => {
    afterEach(() => {
      usePredictionStore.setState({ pending: [], resolved: [] });
      act(() => useSettingsStore.setState({ streakShown: true }));
    });

    it('shows no streak once it has ended, whatever the stored one says', () => {
      // Five days in a row, the last ten days ago: no rest day saved, so it
      // ended nine days ago. The stored figure still says 5.
      usePredictionStore.setState({ pending: loggedDaily(5, 10), resolved: [] });
      render(
        <CalibrationView
          userStat={userStat({
            total_resolved: 153,
            rating_is_provisional: false,
            calibration_rating: 86,
            current_streak: 5,
          })}
          calibration={{ rating: 86, buckets: [] }}
          categoryStats={[]}
          nextBadges={{}}
        />,
      );
      expect(screen.getByText(/^153 scored/)).toHaveTextContent(/^153 scored$/);
      expect(screen.queryByText(/day streak/)).toBeNull();
    });

    it('shows the running one, though the stored one lags behind', () => {
      usePredictionStore.setState({ pending: loggedDaily(9), resolved: [] });
      render(
        <CalibrationView
          userStat={userStat({
            total_resolved: 153,
            rating_is_provisional: false,
            calibration_rating: 86,
            current_streak: 0,
          })}
          calibration={{ rating: 86, buckets: [] }}
          categoryStats={[]}
          nextBadges={{}}
        />,
      );
      expect(screen.getByText(/^153 scored/)).toHaveTextContent('153 scored, 9-day streak');
    });

    it('still hides it while the streak is off in You', () => {
      usePredictionStore.setState({ pending: loggedDaily(9), resolved: [] });
      useSettingsStore.setState({ streakShown: false });
      render(
        <CalibrationView
          userStat={userStat({
            total_resolved: 153,
            rating_is_provisional: false,
            calibration_rating: 86,
            current_streak: 9,
          })}
          calibration={{ rating: 86, buckets: [] }}
          categoryStats={[]}
          nextBadges={{}}
        />,
      );
      expect(screen.getByText(/^153 scored/)).toHaveTextContent(/^153 scored$/);
    });

    it('lets it go when the days pass with nothing written, as Today does', () => {
      const start = new Date(2026, 10, 18, 15, 0, 0);
      jest.useFakeTimers({ now: start });
      try {
        usePredictionStore.setState({ pending: loggedDaily(5, 0, start), resolved: [] });
        render(
          <CalibrationView
            userStat={userStat({
              total_resolved: 153,
              rating_is_provisional: false,
              calibration_rating: 86,
              current_streak: 5,
            })}
            calibration={{ rating: 86, buckets: [] }}
            categoryStats={[]}
            nextBadges={{}}
          />,
        );
        expect(screen.getByText(/^153 scored/)).toHaveTextContent('153 scored, 5-day streak');

        // The next day stands on yesterday; the one after, it has ended.
        act(() => {
          jest.advanceTimersByTime(24 * 60 * 60 * 1000);
        });
        expect(screen.getByText(/^153 scored/)).toHaveTextContent('153 scored, 5-day streak');
        act(() => {
          jest.advanceTimersByTime(24 * 60 * 60 * 1000);
        });
        expect(screen.getByText(/^153 scored/)).toHaveTextContent(/^153 scored$/);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  it('leaves the calibrating state as it was, with the link under the progress', () => {
    render(
      <CalibrationView
        userStat={userStat({ total_resolved: 12, calibration_rating: 80 })}
        calibration={EMPTY_CAL}
        categoryStats={[]}
        nextBadges={{}}
        ratingRange={{ giveOrTake: 3, low: 77, high: 83 }}
        weekChange={{ before: 78, now: 80, answered: 4 }}
        perfect={{ typical: 86, low: 80, high: 91 }}
        onExplain={() => {}}
      />,
    );
    expect(screen.getByTestId('rating-provisional')).toBeTruthy();
    // No number, and no line about one, before the rating unlocks.
    for (const id of ['stats-rating-meaning', 'stats-perfect', 'stats-rating-range', 'stats-week-change']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.queryByText(/points off|as good as anyone can tell|since last week/)).toBeNull();
    expect(screen.queryByText(/^12 scored/)).toBeNull();
    expect(screen.getByTestId('stats-explain')).toHaveTextContent('What does this mean?');
  });
});

// Owner, 2026-11-23: explanations live one tap away, not beside the score.
describe('CalibrationView — the rating block', () => {
  const unlocked = () => (
    <CalibrationView
      userStat={userStat({ total_resolved: 40, rating_is_provisional: false })}
      calibration={EMPTY_CAL}
      categoryStats={[]}
      nextBadges={{}}
      onExplain={jest.fn()}
      answeredCount={3}
    />
  );

  // Record audit 2026-11-23: with no caption, playtesters read the 70 / 85 /
  // 90 marks as tiers for the overall rating. Drawn as Today's bar is, with
  // its give-or-take band.
  it('draws the bar without badge marks, their numbers or a caption', () => {
    const { queryByTestId, queryByText, queryByLabelText, getByTestId } = render(
      <CalibrationView
        userStat={userStat({ total_resolved: 40, rating_is_provisional: false, calibration_rating: 86 })}
        calibration={EMPTY_CAL}
        categoryStats={[]}
        nextBadges={{}}
        ratingRange={{ giveOrTake: 3, low: 83, high: 89 }}
        onExplain={jest.fn()}
        answeredCount={3}
      />,
    );
    const hidden = { includeHiddenElements: true } as const;
    for (const t of ['70', '85', '90']) {
      expect(queryByTestId(`score-bar-label-${t}`, hidden)).toBeNull();
    }
    expect(queryByTestId('stats-score-bar-caption', hidden)).toBeNull();
    expect(queryByText(/badge bars/, hidden)).toBeNull();
    expect(queryByLabelText(/badge bars/)).toBeNull();
    expect(getByTestId('stats-score-bar-range', hidden)).toBeTruthy();
  });

  // Code review 2026-11-23: at large text the words wrap before their chevron
  // is pushed off the row.
  it('lets the words of each chevron row shrink before the chevron', () => {
    const { getByText, getByTestId } = render(unlocked());
    expect(StyleSheet.flatten(getByText('What does this mean?').props.style).flexShrink).toBe(1);
    expect(StyleSheet.flatten(getByText('More about your record').props.style).flexShrink).toBe(1);
    expect(getByTestId('stats-fine-toggle')).toBeTruthy();
  });

  it('shows "What does this mean?" as a link with a chevron, and the fold with its own', () => {
    const { getByTestId } = render(unlocked());
    const link = getByTestId('stats-explain');
    expect(link.props.accessibilityRole).toBe('button');
    expect(link).toHaveTextContent('What does this mean?');
    expect(link.findAll((n: { props: { name?: { ios?: string } } }) => n.props.name?.ios === 'chevron.right').length).toBeGreaterThan(0);
    const fold = getByTestId('stats-fine-toggle');
    expect(fold.findAll((n: { props: { name?: { ios?: string } } }) => n.props.name?.ios === 'chevron.down').length).toBeGreaterThan(0);
    fireEvent.press(fold);
    expect(getByTestId('stats-fine-toggle').findAll((n: { props: { name?: { ios?: string } } }) => n.props.name?.ios === 'chevron.up').length).toBeGreaterThan(0);
  });
});
