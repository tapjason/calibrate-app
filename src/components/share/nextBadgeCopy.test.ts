import { nextBadge } from '@/engine/calibration';
import { MIN_N_CATEGORY, type Category, type CategoryStat } from '@/types';

import { nextBadgeProgress } from './nextBadgeCopy';

function stat(category: Category, resolved: number, score: number): CategoryStat {
  return {
    user_id: 'u1',
    category,
    predictions_made: resolved,
    predictions_resolved: resolved,
    calibration_score: score,
    score_is_provisional: resolved < MIN_N_CATEGORY,
    badge_level: 'guesser',
  };
}

/** The store derives nextBadges from the engine; do the same here. */
function next(stats: CategoryStat[]) {
  return Object.fromEntries(
    stats.map((s) => [
      s.category,
      nextBadge(s.predictions_resolved, s.calibration_score),
    ]),
  );
}

function progressFor(stats: CategoryStat[]) {
  return nextBadgeProgress(stats, next(stats));
}

describe('nextBadgeProgress', () => {
  it('says nothing without category stats', () => {
    expect(nextBadgeProgress([], {})).toBeNull();
  });

  it('counts down resolutions to the next badge', () => {
    expect(progressFor([stat('health', 17, 60)])).toEqual({
      category: 'health',
      badge: 'tracker',
      badgeLabel: 'Tracker',
      text: 'Tracker in health: 3 to go',
      progress: 17 / 20,
    });
  });

  it('picks the category closest to its next badge', () => {
    const p = progressFor([
      stat('work', 5, 50),
      stat('health', 18, 50),
      stat('finance', 2, 50),
    ]);
    expect(p?.category).toBe('health');
    expect(p?.text).toBe('Tracker in health: 2 to go');
  });

  it('breaks ties alphabetically so the story is stable', () => {
    expect(progressFor([stat('work', 10, 50), stat('health', 10, 50)])?.category).toBe(
      'health',
    );
  });

  it('prefers a resolution countdown over a score gate', () => {
    // work is a Tracker needing score > 70 for Forecaster; social needs 4 more.
    const p = progressFor([stat('work', 25, 65), stat('social', 16, 50)]);
    expect(p?.text).toBe('Tracker in social: 4 to go');
  });

  it('names the score gate when no category is short on resolutions', () => {
    expect(progressFor([stat('work', 25, 64.8)])).toEqual({
      category: 'work',
      badge: 'forecaster',
      badgeLabel: 'Forecaster',
      text: 'Forecaster in work: a score above 70 (now 64)',
      progress: null,
    });
  });

  it('never prints a provisional score', () => {
    const provisional = { ...stat('work', 25, 64), score_is_provisional: true };
    expect(nextBadgeProgress([provisional], next([provisional]))).toBeNull();
  });

  it('says nothing at the top of the ladder', () => {
    expect(progressFor([stat('health', 120, 95)])).toBeNull();
  });
});
