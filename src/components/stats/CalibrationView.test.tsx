import { render } from '@testing-library/react-native';

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
    expect(getByText(/until\s+your rating unlocks/)).toBeTruthy();
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
