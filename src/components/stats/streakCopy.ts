// Presentation helper for the streak line on Home (roadmap D2). Pure and
// testable, like ratingHeadline.ts. The counting is the engine's
// (src/engine/streak.ts, through predictionStore.streakNow); this only words it.
//
// Tone (DESIGN_SYSTEM §7.9, "No guilt"): the line says what today adds, never
// what it would cost. "1 more today makes it 13", not "don't lose your streak".

import { STREAK_DAY_MIN, type StreakStatus } from '@/types';

export interface StreakCopy {
  /** "12-day streak", or how to start one. */
  headline: string;
  /** What today adds, or that it already counts. */
  detail: string | null;
  /** Today's progress toward a counted day, 0..STREAK_DAY_MIN, for the pips. */
  filled: number;
  /** One sentence for a screen reader. */
  spoken: string;
}

/** Null when there is nothing yet: no streak and nothing done today. */
export function streakCopy(status: StreakStatus): StreakCopy | null {
  const { streak, today, todayCounts } = status;
  if (streak === 0 && today === 0) return null;

  const filled = Math.min(today, STREAK_DAY_MIN);
  const more = STREAK_DAY_MIN - filled;
  const plural = (n: number) => (n === 1 ? 'prediction' : 'predictions');

  if (streak === 0) {
    const headline = `${more} more today starts a streak`;
    return {
      headline,
      detail: null,
      filled,
      spoken: `${headline}. ${today} of ${STREAK_DAY_MIN} ${plural(STREAK_DAY_MIN)} logged or answered today.`,
    };
  }

  const headline = `${streak}-day streak`;
  const detail = todayCounts ? 'Today counts' : `${more} more today makes it ${streak + 1}`;
  return {
    headline,
    detail,
    filled,
    spoken: `${headline}. ${detail}.`,
  };
}
