import { fireEvent, render } from '@testing-library/react-native';

import { CalibrationView } from '@/components/stats/CalibrationView';
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
    expect(getByText('4 of 20 resolved · 3 on their way')).toBeTruthy();
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
    expect(getByTestId('chart-takeaway').props.children).toBe(
      "You're overconfident at 80–100%",
    );
    expect(getByText('Of 12 things you called 80–100% likely, 7 happened.')).toBeTruthy();
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
