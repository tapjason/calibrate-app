// Presentation helper: decide what the big "calibration rating" slot shows.
//
// CLAUDE.md is explicit — while the rating is provisional (too few resolutions
// for the number to mean anything) the UI must NOT headline it. Instead it
// shows progress toward the threshold. This keeps that rule in one pure,
// testable place so every screen renders the provisional state the same way.

import { MIN_N_OVERALL, type UserStat } from '@/types';

export type RatingHeadline =
  | { provisional: false; rating: number }
  | { provisional: true; remaining: number };

/**
 * `null`   → no stats yet (render a placeholder).
 * provisional → `remaining` resolutions still needed before the score unlocks.
 * else     → `rating`, the rounded headline number.
 */
export function ratingHeadline(userStat: UserStat | null): RatingHeadline | null {
  if (!userStat) return null;
  if (userStat.rating_is_provisional) {
    return {
      provisional: true,
      remaining: Math.max(0, MIN_N_OVERALL - userStat.total_resolved),
    };
  }
  return { provisional: false, rating: Math.round(userStat.calibration_rating) };
}
