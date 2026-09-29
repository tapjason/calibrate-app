import type { BucketStat, CategoryStat, ShareCard, UserStat } from '@/types';

import {
  buildShareCard,
  shareHeadline,
  shareLines,
  shareSubline,
  shareText,
} from './cardCopy';

function userStat(over: Partial<UserStat> = {}): UserStat {
  return {
    user_id: 'u1',
    calibration_rating: 88.4,
    total_predictions: 60,
    total_resolved: 55,
    current_streak: 3,
    rating_is_provisional: false,
    ...over,
  };
}

function categoryStat(over: Partial<CategoryStat> = {}): CategoryStat {
  return {
    user_id: 'u1',
    category: 'health',
    predictions_made: 20,
    predictions_resolved: 20,
    calibration_score: 88,
    score_is_provisional: false,
    badge_level: 'sharp',
    ...over,
  };
}

describe('buildShareCard', () => {
  it('returns null with no stats to show', () => {
    expect(buildShareCard(null, [])).toBeNull();
    expect(buildShareCard(userStat(), [])).toBeNull();
  });

  it('ignores categories with nothing resolved yet', () => {
    const card = buildShareCard(userStat(), [
      categoryStat({ category: 'finance', predictions_resolved: 0 }),
    ]);
    expect(card).toBeNull();
  });

  it('orders categories strongest badge first', () => {
    const card = buildShareCard(userStat(), [
      categoryStat({ category: 'finance', badge_level: 'guesser' }),
      categoryStat({ category: 'health', badge_level: 'sharp' }),
      categoryStat({ category: 'work', badge_level: 'tracker' }),
    ]);
    expect(card?.categories.map((c) => c.category)).toEqual([
      'health',
      'work',
      'finance',
    ]);
  });

  it('breaks badge ties on the better-evidenced category', () => {
    const card = buildShareCard(userStat(), [
      categoryStat({
        category: 'work',
        badge_level: 'tracker',
        predictions_resolved: 20,
      }),
      categoryStat({
        category: 'social',
        badge_level: 'tracker',
        predictions_resolved: 45,
      }),
    ]);
    expect(card?.categories[0].category).toBe('social');
  });

  // CLAUDE.md: never present a number built on noise — least of all on the
  // most public artifact the app produces.
  it('withholds a provisional rating from the card', () => {
    const card = buildShareCard(
      userStat({ rating_is_provisional: true, total_resolved: 8 }),
      [categoryStat()],
    );
    expect(card?.rating).toBeNull();
  });

  it('rounds a settled rating for display', () => {
    const card = buildShareCard(userStat(), [categoryStat()]);
    expect(card?.rating).toBe(88);
  });
});

describe('shareHeadline', () => {
  it('contrasts the best and worst category', () => {
    const card = buildShareCard(userStat(), [
      categoryStat({ category: 'health', badge_level: 'sharp' }),
      categoryStat({ category: 'work', badge_level: 'tracker' }),
      categoryStat({ category: 'finance', badge_level: 'guesser' }),
    ])!;
    expect(shareHeadline(card)).toBe('Sharp in health · Guesser in finance');
  });

  it('stands alone when there is only one category to show', () => {
    const card = buildShareCard(userStat(), [
      categoryStat({ category: 'health', badge_level: 'forecaster' }),
    ])!;
    expect(shareHeadline(card)).toBe('Forecaster in health');
  });
});

describe('shareSubline', () => {
  it('prints the rating once it has settled', () => {
    const card = buildShareCard(userStat(), [categoryStat()])!;
    expect(shareSubline(card)).toBe(
      'Calibration 88/100 · 55 predictions resolved',
    );
  });

  it('counts down to the threshold while provisional', () => {
    const card = buildShareCard(
      userStat({ rating_is_provisional: true, total_resolved: 8 }),
      [categoryStat()],
    )!;
    expect(shareSubline(card)).toBe(
      '12 more resolutions until my calibration unlocks',
    );
  });
});

describe('shareText', () => {
  const bucket = (low: number, direction: BucketStat['direction']): BucketStat => ({
    low,
    high: low + 20,
    total_resolved: 10,
    resolved_yes: 5,
    stated_confidence_mean: low + 10,
    actual_rate: 0.5,
    bucket_error: 0,
    direction,
  });
  const card = (rating: number | null): ShareCard => ({
    categories: [
      { category: 'health', badge_level: 'sharp' },
      { category: 'finance', badge_level: 'guesser' },
    ],
    rating,
    total_resolved: 40,
  });

  it('is Wordle-style once the rating is unlocked: one square per band', () => {
    const text = shareText(card(81), [
      bucket(20, 'calibrated'),
      bucket(40, 'calibrated'),
      bucket(60, 'overconfident'),
      bucket(80, 'underconfident'),
    ]);
    expect(text).toBe(
      'My calibration · Calibrate\nSharp in health · Guesser in finance\n⬜🟩🟩🟧🟦 score 81',
    );
  });

  // CLAUDE.md: never publish a verdict built on noise.
  it('drops the squares and score while provisional', () => {
    const text = shareText(card(null), [bucket(80, 'overconfident')]);
    expect(text).not.toMatch(/score|🟧/);
    expect(text).toContain('40 predictions resolved so far');
  });

  it('never carries a prediction title', () => {
    const text = shareText(card(81), []);
    expect(text.split('\n')).toHaveLength(3);
  });
});

describe('shareLines', () => {
  const card = (levels: Array<[string, string]>): ShareCard => ({
    categories: levels.map(([category, badge_level]) => ({
      category: category as ShareCard['categories'][number]['category'],
      badge_level: badge_level as ShareCard['categories'][number]['badge_level'],
    })),
    rating: null,
    total_resolved: 30,
  });

  it('splits best and worst into an identity line and a contrast line', () => {
    expect(shareLines(card([['health', 'sharp'], ['finance', 'guesser']]))).toEqual({
      identity: 'Sharp in health',
      contrast: 'Guesser in finance',
    });
  });

  it('draws no contrast when the tiers are the same', () => {
    expect(shareLines(card([['work', 'guesser'], ['health', 'guesser']])).contrast).toBeNull();
  });

  it('draws no contrast with a single category', () => {
    expect(shareLines(card([['work', 'tracker']]))).toEqual({
      identity: 'Tracker in work',
      contrast: null,
    });
  });
});

describe('shareSubline plural', () => {
  it('says "1 more resolution", not "resolutions"', () => {
    expect(
      shareSubline({ categories: [], rating: null, total_resolved: 19 }),
    ).toBe('1 more resolution until my calibration unlocks');
  });
});
