import type { CategoryStat, UserStat } from '@/types';

import { detectMilestone } from './milestones';

const user = (over: Partial<UserStat> = {}): UserStat => ({
  user_id: 'u1',
  calibration_rating: 78.4,
  total_predictions: 20,
  total_resolved: 19,
  current_streak: 0,
  rating_is_provisional: true,
  ...over,
});

const cat = (over: Partial<CategoryStat> = {}): CategoryStat => ({
  user_id: 'u1',
  category: 'health',
  predictions_made: 19,
  predictions_resolved: 19,
  calibration_score: 81.2,
  score_is_provisional: false,
  badge_level: 'guesser',
  ...over,
});

describe('detectMilestone', () => {
  it('says nothing without a previous snapshot (a first load is not an achievement)', () => {
    expect(
      detectMilestone(null, [], user({ rating_is_provisional: false }), []),
    ).toBeNull();
  });

  it('announces the overall rating unlocking, rounded', () => {
    expect(
      detectMilestone(user(), [], user({ rating_is_provisional: false }), []),
    ).toEqual({ kind: 'rating_unlocked', rating: 78 });
  });

  it('announces a badge tier-up, highest tier first', () => {
    const m = detectMilestone(
      user({ rating_is_provisional: false }),
      [cat(), cat({ category: 'work', badge_level: 'tracker' })],
      user({ rating_is_provisional: false }),
      [
        cat({ badge_level: 'tracker' }),
        cat({ category: 'work', badge_level: 'forecaster' }),
      ],
    );
    expect(m).toEqual({ kind: 'tier_up', category: 'work', badge: 'forecaster' });
  });

  it('puts the rating unlock ahead of a tier-up in the same resolution', () => {
    const m = detectMilestone(user(), [cat()], user({ rating_is_provisional: false }), [
      cat({ badge_level: 'tracker' }),
    ]);
    expect(m?.kind).toBe('rating_unlocked');
  });

  it('announces a category score unlocking', () => {
    const m = detectMilestone(
      user({ rating_is_provisional: false }),
      [cat({ score_is_provisional: true })],
      user({ rating_is_provisional: false }),
      [cat({ score_is_provisional: false })],
    );
    expect(m).toEqual({ kind: 'category_unlocked', category: 'health', score: 81 });
  });

  // DESIGN_SYSTEM §6.2: never announce a demotion.
  it('never announces a drop', () => {
    const m = detectMilestone(
      user({ rating_is_provisional: false }),
      [cat({ badge_level: 'sharp' })],
      user({ rating_is_provisional: false }),
      [cat({ badge_level: 'forecaster' })],
    );
    expect(m).toBeNull();
  });

  it('counts a brand-new category reaching Tracker as a tier-up', () => {
    const m = detectMilestone(
      user({ rating_is_provisional: false }),
      [],
      user({ rating_is_provisional: false }),
      [cat({ category: 'social', badge_level: 'tracker', score_is_provisional: false })],
    );
    expect(m).toEqual({ kind: 'tier_up', category: 'social', badge: 'tracker' });
  });
});
