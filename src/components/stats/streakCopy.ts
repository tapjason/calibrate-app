// Presentation helper for the streak line on Home (roadmap D2). Pure and
// testable, like ratingHeadline.ts. The counting is the engine's
// (src/engine/streak.ts, through predictionStore.streakNow); this only words it.
//
// Tone (DESIGN_SYSTEM §7.9, "No guilt"): the line says what today adds, never
// what it would cost. "1 more today makes it 13", not "don't lose your streak".
//
// Checkpoints (decided 2026-10-06): 7, 30, 100 and 365 days, then each further
// year, are named on the day they're reached; the engine says which day that
// is and what comes next.

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
  /** Today reached a checkpoint, so the row is marked. */
  checkpoint: boolean;
}

const YEAR_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** What a checkpoint streak is called: "A full week", "Triple digits", "Two full years". */
export function checkpointName(days: number): string {
  if (days === 7) return 'A full week';
  if (days === 30) return 'A full month';
  if (days === 100) return 'Triple digits';
  if (days === 365) return 'A full year';
  const years = Math.round(days / 365);
  const word = YEAR_WORDS[years] ?? String(years);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} full years`;
}

/** "Next milestone: 30 days", the line under a reached checkpoint. */
function nextLine(next: number): string {
  return `Next milestone: ${next} days`;
}

/**
 * The card Resolve shows when an answer reached a checkpoint. The number is
 * the card's figure, so the title is the name.
 */
export function checkpointCopy(days: number, next: number): { title: string; body: string } {
  return { title: checkpointName(days), body: `${days} days in a row. ${nextLine(next)}.` };
}

/** Null when there is nothing yet: no streak and nothing done today. */
export function streakCopy(status: StreakStatus): StreakCopy | null {
  const { streak, today, todayCounts, checkpoint, nextCheckpoint } = status;
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
      checkpoint: false,
    };
  }

  const headline = `${streak}-day streak`;
  // The day before one says so, as a gain: "makes it 7: a full week".
  const eve = streak + 1 === nextCheckpoint;
  const name = checkpointName(nextCheckpoint);
  const reaches = `${streak + 1}: ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  let detail: string;
  if (checkpoint !== null) {
    detail = `${checkpointName(checkpoint)}. ${nextLine(nextCheckpoint)}`;
  } else if (todayCounts) {
    detail = eve ? `Today counts. Tomorrow can make it ${reaches}` : `Today counts. ${nextLine(nextCheckpoint)}`;
  } else {
    detail = `${more} more today makes it ${eve ? reaches : streak + 1}`;
  }
  return {
    headline,
    detail,
    filled,
    spoken: `${headline}. ${detail}.`,
    checkpoint: checkpoint !== null,
  };
}
