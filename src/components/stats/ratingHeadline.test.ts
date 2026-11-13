import type { UserStat } from '@/types';

import { ratingHeadline, ratingMeaningLine, spreadThinLine } from './ratingHeadline';

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

// Step 173: "is 86 good?", in points. 100 − rating is the count-weighted
// average gap, range by range (CLAUDE.md's formula).
describe('ratingMeaningLine', () => {
  it('says the average gap from the rounded rating, so the two add to 100', () => {
    expect(ratingMeaningLine(86)).toBe(
      'Range by range, what you said averaged about 14 points away from how often those things happened, each range counting by how many answers it holds.',
    );
    expect(ratingMeaningLine(85.5)).toMatch(/about 14 points/);
    expect(ratingMeaningLine(99, 'band')).toBe(
      'Band by band, what you said averaged about 1 point away from how often those things happened, each band counting by how many answers it holds.',
    );
    expect(ratingMeaningLine(100)).toBe(
      'Range by range, what you said matched how often those things happened.',
    );
  });
});

// Step 173: why no badge, when the answers are spread thin.
describe('spreadThinLine', () => {
  it('says so when the total would have earned one in a single category', () => {
    expect(spreadThinLine(73, [7, 6, 5, 6, 7, 5, 6, 5, 6, 5, 5, 5, 5, 0], 20)).toBe(
      'Badges are per category, at 20 scored answers in one. Your 73 scored answers are spread over 13 categories, so none has 20 yet.',
    );
  });
  it('says nothing under 20 in all, with one category, or once one has 20', () => {
    expect(spreadThinLine(15, [8, 7], 20)).toBeNull();
    expect(spreadThinLine(19, [19], 20)).toBeNull();
    expect(spreadThinLine(30, [20, 10], 20)).toBeNull();
  });
});
