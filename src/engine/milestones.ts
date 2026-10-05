// Milestone detection (L3): did the last recompute cross a line worth
// celebrating? Pure — previous stats and next stats in, at most one
// milestone out.
//
// DESIGN_SYSTEM §6.2 gives exactly three moments the full treatment; two of
// them live here (score unlock, badge tier-up; the Warmup verdict is the
// third). Only upward crossings count: a score that slips back under a line
// or a badge that drops is never announced, let alone animated.
//
// Layer rule: imports only from @/types.

import type { BadgeLevel, CategoryStat, Milestone, UserStat } from '@/types';

const LADDER: readonly BadgeLevel[] = [
  'guesser',
  'tracker',
  'forecaster',
  'sharp',
  'oracle',
];
const rank = (b: BadgeLevel) => LADDER.indexOf(b);

/**
 * The single most significant milestone between two stat snapshots, or null.
 * One at a time, by design: the celebration budget is small, and three
 * confetti bursts at once would be none.
 *
 * Priority: the overall rating unlocking, then a badge tier-up (highest new
 * tier first), then a category score unlocking.
 */
export function detectMilestone(
  prevUser: UserStat | null,
  prevCategories: readonly CategoryStat[],
  nextUser: UserStat,
  nextCategories: readonly CategoryStat[],
): Milestone | null {
  // Without a previous snapshot there is no "crossing", only a first load.
  if (!prevUser) return null;

  if (prevUser.rating_is_provisional && !nextUser.rating_is_provisional) {
    return { kind: 'rating_unlocked', rating: Math.round(nextUser.calibration_rating) };
  }

  const prevByCategory = new Map(prevCategories.map((c) => [c.category, c]));

  const tierUps = nextCategories
    .map((next) => ({ next, prev: prevByCategory.get(next.category) }))
    .filter(
      ({ next, prev }) => rank(next.badge_level) > rank(prev?.badge_level ?? 'guesser'),
    )
    .sort((a, b) => rank(b.next.badge_level) - rank(a.next.badge_level));
  if (tierUps.length > 0) {
    const { next, prev } = tierUps[0];
    return {
      kind: 'tier_up',
      category: next.category,
      badge: next.badge_level,
      from: prev?.badge_level ?? 'guesser',
    };
  }

  const unlocked = nextCategories.find((next) => {
    const prev = prevByCategory.get(next.category);
    return (prev?.score_is_provisional ?? true) && !next.score_is_provisional;
  });
  if (unlocked) {
    return {
      kind: 'category_unlocked',
      category: unlocked.category,
      score: Math.round(unlocked.calibration_score),
    };
  }

  return null;
}
