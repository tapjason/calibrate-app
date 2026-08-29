import type { UserStat } from '@/types';

import { ratingHeadline } from './ratingHeadline';

const userStat = (overrides: Partial<UserStat> = {}): UserStat => ({
  user_id: 'u1',
  calibration_rating: 0,
  total_predictions: 0,
  total_resolved: 0,
  current_streak: 0,
  rating_is_provisional: true,
  ...overrides,
});

describe('ratingHeadline', () => {
  it('returns null when there are no stats', () => {
    expect(ratingHeadline(null)).toBeNull();
  });

  it('reports remaining resolutions while provisional (MIN_N_OVERALL=20)', () => {
    expect(ratingHeadline(userStat({ total_resolved: 8 }))).toEqual({
      provisional: true,
      remaining: 12,
    });
  });

  it('never reports a negative remaining', () => {
    // Defensive: if the flag is stale-true past the threshold, clamp at 0.
    expect(
      ratingHeadline(userStat({ total_resolved: 25, rating_is_provisional: true })),
    ).toEqual({ provisional: true, remaining: 0 });
  });

  it('rounds and headlines the rating once non-provisional', () => {
    expect(
      ratingHeadline(
        userStat({
          calibration_rating: 82.6,
          total_resolved: 40,
          rating_is_provisional: false,
        }),
      ),
    ).toEqual({ provisional: false, rating: 83 });
  });
});
