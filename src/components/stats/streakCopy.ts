// Presentation helper for the streak line on Home (roadmap D2). Pure and
// testable, like ratingHeadline.ts. The counting is the engine's
// (src/engine/streak.ts, through predictionStore.streakNow); this only words it.
//
// Tone (DESIGN_SYSTEM §7.9, "No guilt"): the line says what today adds, never
// what it would cost. "One prediction today makes it 13", not "don't lose your
// streak". Since D17 one prediction keeps the streak and three is the day's
// goal: the dots fill toward it, and the line says when it's met.
//
// Checkpoints (decided 2026-10-06): 7, 30, 100 and 365 days, then each further
// year, are named on the day they're reached; the engine says which day that
// is and what comes next.
//
// Rest days (decided 2026-10-07, roadmap step 87) get their own quiet line:
// what's saved, the day one was spent, or when the next one comes. A spent
// rest day is said plainly and as a relief ("Yesterday was a rest day"),
// never as something missed.

import { DAILY_GOAL, type StreakStatus } from '@/types';

export interface StreakCopy {
  /** "12-day streak". */
  headline: string;
  /** What today adds, or that it already counts. */
  detail: string | null;
  /** Today's progress toward the day's goal, 0..DAILY_GOAL, for the pips. */
  filled: number;
  /** One sentence for a screen reader. */
  spoken: string;
  /** Today reached a checkpoint, so the row is marked. */
  checkpoint: boolean;
  /** The rest-day line, or null with no streak running. */
  rest: string | null;
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

/**
 * "Next milestone: 30 days". No-break spaces inside "Next milestone:" and
 * "30 days", so at 320pt it wraps between them rather than leaving "Next" at
 * the end of one line (roadmap step 70).
 */
function nextLine(next: number): string {
  return `Next\u00A0milestone: ${next}\u00A0days`;
}

/**
 * The card Resolve shows when an answer reached a checkpoint. The number is
 * the card's figure, so the title is the name and the body stays one short
 * line (a three-digit figure leaves little room at 320pt); the spoken label
 * says the number, which a screen reader would otherwise never hear.
 */
export function checkpointCopy(
  days: number,
  next: number,
): { title: string; body: string; spoken: string } {
  const title = checkpointName(days);
  const body = `${nextLine(next)}.`;
  return { title, body, spoken: `${days}-day streak. ${title}. ${body}` };
}

/**
 * What the reserve says today: a rest day just spent comes first (that's the
 * one the person needs to hear), then one just saved, then what's saved, then
 * when the next one comes. "day\u00A07" keeps the number with its word.
 */
function restLine(status: StreakStatus): string | null {
  const { streak, restDays, restUsed, restEarnedToday, nextRestAt } = status;
  if (streak === 0) return null;
  const saved = (n: number) => `${n} rest ${n === 1 ? 'day' : 'days'} saved`;
  if (restUsed > 0) {
    const spent =
      restUsed === 1 ? 'Yesterday was a rest day' : `The last ${restUsed} days were rest days`;
    return restDays > 0 ? `${spent}. ${restDays} more saved` : spent;
  }
  if (restEarnedToday) {
    return restDays > 1 ? 'Today saved a second rest day' : 'Today saved a rest day';
  }
  if (restDays > 0) return saved(restDays);
  return nextRestAt === null ? null : `A rest day comes with day\u00A0${nextRestAt}`;
}

/**
 * Null when there is nothing yet: no streak and nothing done today. Since D17
 * one prediction starts or extends a streak, so anything done today means a
 * streak of at least one; the old "2 more today starts a streak" is gone.
 */
export function streakCopy(status: StreakStatus): StreakCopy | null {
  const { streak, today, todayCounts, checkpoint, nextCheckpoint } = status;
  if (streak === 0) return null;

  // The dots are the day's goal (D17), not the streak's price.
  const filled = Math.min(today, DAILY_GOAL);
  const toGoal = DAILY_GOAL - filled;

  const headline = `${streak}-day streak`;
  // The day before one says so, as a gain: "makes it 7: a full week".
  const eve = streak + 1 === nextCheckpoint;
  const name = checkpointName(nextCheckpoint);
  const reaches = `${streak + 1}: ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  let detail: string;
  if (checkpoint !== null) {
    detail = `${checkpointName(checkpoint)}. ${nextLine(nextCheckpoint)}`;
  } else if (!todayCounts) {
    detail = `One prediction today makes it ${eve ? reaches : streak + 1}`;
  } else if (eve) {
    detail = `Today counts. Tomorrow can make it ${reaches}`;
  } else if (toGoal > 0) {
    // Short enough for one line at 375pt; the pips show the same count.
    detail = `Today counts. Goal: ${filled} of ${DAILY_GOAL}`;
  } else {
    detail = `Today's goal met. ${nextLine(nextCheckpoint)}`;
  }
  const rest = restLine(status);
  return {
    headline,
    detail,
    filled,
    spoken: rest ? `${headline}. ${detail}. ${rest}.` : `${headline}. ${detail}.`,
    checkpoint: checkpoint !== null,
    rest,
  };
}
