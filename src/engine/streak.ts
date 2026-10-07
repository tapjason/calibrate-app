// Streak calculation. Pure function — like calibration.ts, this module may
// only import from @/types and sibling engine files.
//
// What a day needs (UI_ROADMAP D2, 2026-10-05; lowered by D17, 2026-10-07):
// at least STREAK_DAY_MIN (one) prediction *done* that day, counting each
// prediction once for the day it was logged (created_at) and once for the day
// it was answered yes or no (resolved_at). It was three; Duolingo found a
// streak that one lesson extends keeps more people than one that waits for
// the daily goal, so three is now the day's goal (DAILY_GOAL), shown on the
// streak row and asked of nobody. Days, not weeks, because a number that
// climbs every day is the appeal. Logging counts as well as answering because
// answers arrive when predictions come due, which the user doesn't choose: a
// streak of answers alone broke on days with nothing due. A skip ("can't
// tell") is an explicit "don't score this" and earns nothing, as before.
//
// Days are the device's LOCAL calendar days. A streak is a human idea ("I
// did this every day this week"), and in UTC a Pacific-time user who acts at
// 10:00 Monday and 18:00 Tuesday has acted on Monday and Wednesday — a gap
// they never made. The offset is on the device, offline.
//
// Expiry: given `now`, today counts once it reaches the minimum; until then
// the streak runs through yesterday, so it doesn't vanish at midnight before
// the user has had a chance to extend it. A streak with a day since its last
// counted one that no rest day covered has ended and reads 0. Without `now`
// the streak is anchored at the latest counted day (kept for callers with no
// clock to offer).
//
// Checkpoints (decided 2026-10-06): 7, 30, 100 and 365 days, then every
// further year. The streak is a milestone on the day it reaches one, once
// that day counts; the day after, it's climbing toward the next.
//
// Rest days (decided 2026-10-07, roadmap step 87): every REST_DAY_EVERY
// counted days save one, up to REST_DAYS_MAX. A past day that didn't count
// spends one, and the streak carries on without adding that day; with none
// saved, it ends and the reserve goes with it. Nothing is stored: the walk
// below replays the days from the first one that counted, so a sync from
// another device or a back-dated answer gives the same streak everywhere.
// Lally et al. 2010: one missed day doesn't undo a habit, so it shouldn't
// end the counter of one (research/retention-2026-10.md §2.2).

import {
  REST_DAY_EVERY,
  REST_DAYS_MAX,
  STREAK_CHECKPOINTS,
  STREAK_DAY_MIN,
  type ComputeStreak,
  type Prediction,
  type StreakStatus,
} from '@/types';

import { localDayNumber } from './localTime';

export { REST_DAY_EVERY, REST_DAYS_MAX, STREAK_CHECKPOINTS, STREAK_DAY_MIN };

const YEAR = 365;
const LAST_LISTED = STREAK_CHECKPOINTS[STREAK_CHECKPOINTS.length - 1];

/** Whether a streak of `days` is a checkpoint: 7, 30, 100, 365, then each further year. */
export function isStreakCheckpoint(days: number): boolean {
  if (!Number.isInteger(days) || days <= 0) return false;
  if ((STREAK_CHECKPOINTS as readonly number[]).includes(days)) return true;
  return days > LAST_LISTED && days % YEAR === 0;
}

/** The smallest checkpoint above a streak of `days`. */
export function nextStreakCheckpoint(days: number): number {
  const listed = STREAK_CHECKPOINTS.find((c) => c > days);
  if (listed !== undefined) return listed;
  return (Math.floor(days / YEAR) + 1) * YEAR;
}

/**
 * The checkpoint `after` reached that `before` hadn't, or null: the log or
 * answer between them is the one that earned it.
 */
export function checkpointReached(before: StreakStatus, after: StreakStatus): number | null {
  return before.checkpoint === null ? after.checkpoint : null;
}

/** How many predictions were done (logged, or answered yes/no) on each local day. */
function doneByDay(predictions: readonly Prediction[]): Map<number, number> {
  const byDay = new Map<number, number>();
  const add = (iso: string | null) => {
    if (!iso) return;
    const at = Date.parse(iso);
    // An unparseable timestamp belongs to no day rather than to day NaN.
    if (Number.isNaN(at)) return;
    const day = localDayNumber(new Date(at));
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  };
  for (const p of predictions) {
    add(p.created_at);
    if (isYesNo(p)) add(p.resolved_at);
  }
  return byDay;
}

/** The local days that reached STREAK_DAY_MIN. */
function countedDays(byDay: ReadonlyMap<number, number>): Set<number> {
  return new Set([...byDay].filter(([, n]) => n >= STREAK_DAY_MIN).map(([day]) => day));
}

interface Walk {
  /** Counted days in the run that is still going at `through` (0 if none). */
  streak: number;
  /** Rest days saved at the end of `through`. */
  restDays: number;
  /** The days in that run a rest day covered. */
  covered: Set<number>;
  /** The last day in that run that saved a rest day, or null. */
  earnedOn: number | null;
}

/**
 * Replay every day from the first that counted through `through`: a counted
 * day adds one (and every REST_DAY_EVERY-th saves a rest day while there's
 * room); any other day spends a saved rest day, or ends the run.
 */
function walk(counted: ReadonlySet<number>, through: number): Walk {
  let streak = 0;
  let restDays = 0;
  let covered = new Set<number>();
  let earnedOn: number | null = null;
  if (counted.size === 0) return { streak, restDays, covered, earnedOn };
  for (let day = Math.min(...counted); day <= through; day += 1) {
    if (counted.has(day)) {
      streak += 1;
      if (streak % REST_DAY_EVERY === 0 && restDays < REST_DAYS_MAX) {
        restDays += 1;
        earnedOn = day;
      }
    } else if (streak > 0 && restDays > 0) {
      restDays -= 1;
      covered.add(day);
    } else {
      streak = 0;
      restDays = 0;
      covered = new Set();
      earnedOn = null;
    }
  }
  return { streak, restDays, covered, earnedOn };
}

/** The streak length that saves the next rest day, or null while the reserve is full. */
function nextRestAt(streak: number, restDays: number): number | null {
  if (restDays >= REST_DAYS_MAX) return null;
  return (Math.floor(streak / REST_DAY_EVERY) + 1) * REST_DAY_EVERY;
}

export function streakStatus(predictions: readonly Prediction[], now: Date): StreakStatus {
  const byDay = doneByDay(predictions);
  const counted = countedDays(byDay);
  const today = localDayNumber(now);
  const todayDone = byDay.get(today) ?? 0;
  const todayCounts = counted.has(today);
  // Today isn't judged until it's over: short so far, it neither adds nor
  // spends anything, and the streak stands through yesterday.
  const run = walk(counted, todayCounts ? today : today - 1);
  const { streak, restDays } = run;
  let restUsed = 0;
  for (let day = today - 1; run.covered.has(day); day -= 1) restUsed += 1;
  return {
    streak,
    today: todayDone,
    todayCounts,
    checkpoint: todayCounts && isStreakCheckpoint(streak) ? streak : null,
    nextCheckpoint: nextStreakCheckpoint(streak),
    restDays,
    restUsed,
    restEarnedToday: todayCounts && run.earnedOn === today,
    nextRestAt: nextRestAt(streak, restDays),
  };
}

export const computeStreak: ComputeStreak = (predictions, opts) => {
  if (opts?.now) return streakStatus(predictions, opts.now).streak;
  const counted = countedDays(doneByDay(predictions));
  if (counted.size === 0) return 0;
  return walk(counted, Math.max(...counted)).streak;
};

function isYesNo(p: Prediction): boolean {
  return p.status === 'resolved_yes' || p.status === 'resolved_no';
}
