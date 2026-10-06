// Streak calculation. Pure function — like calibration.ts, this module may
// only import from @/types and sibling engine files.
//
// What a day needs (decided 2026-10-05, UI_ROADMAP D2): at least
// STREAK_DAY_MIN predictions *done* that day, counting each prediction once
// for the day it was logged (created_at) and once for the day it was answered
// yes or no (resolved_at). Days, not weeks, because a number that climbs
// every day is the appeal. Logging counts as well as answering because
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
// the user has had a chance to extend it. A streak whose last counted day is
// before yesterday has ended and reads 0. Without `now` the streak is anchored
// at the latest counted day (kept for callers with no clock to offer).
//
// Checkpoints (decided 2026-10-06): 7, 30, 100 and 365 days, then every
// further year. The streak is a milestone on the day it reaches one, once
// that day counts; the day after, it's climbing toward the next.

import {
  STREAK_CHECKPOINTS,
  STREAK_DAY_MIN,
  type ComputeStreak,
  type Prediction,
  type StreakStatus,
} from '@/types';

import { localDayNumber } from './localTime';

export { STREAK_CHECKPOINTS, STREAK_DAY_MIN };

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

/** Consecutive counted days ending at `last`, walking back. */
function runEndingAt(counted: ReadonlySet<number>, last: number): number {
  let streak = 0;
  for (let day = last; counted.has(day); day -= 1) streak += 1;
  return streak;
}

export function streakStatus(predictions: readonly Prediction[], now: Date): StreakStatus {
  const byDay = doneByDay(predictions);
  const counted = new Set(
    [...byDay].filter(([, n]) => n >= STREAK_DAY_MIN).map(([day]) => day),
  );
  const today = localDayNumber(now);
  const todayDone = byDay.get(today) ?? 0;
  const todayCounts = counted.has(today);
  const streak = runEndingAt(counted, todayCounts ? today : today - 1);
  return {
    streak,
    today: todayDone,
    todayCounts,
    checkpoint: todayCounts && isStreakCheckpoint(streak) ? streak : null,
    nextCheckpoint: nextStreakCheckpoint(streak),
  };
}

export const computeStreak: ComputeStreak = (predictions, opts) => {
  if (opts?.now) return streakStatus(predictions, opts.now).streak;
  const byDay = doneByDay(predictions);
  const counted = new Set(
    [...byDay].filter(([, n]) => n >= STREAK_DAY_MIN).map(([day]) => day),
  );
  if (counted.size === 0) return 0;
  return runEndingAt(counted, Math.max(...counted));
};

function isYesNo(p: Prediction): boolean {
  return p.status === 'resolved_yes' || p.status === 'resolved_no';
}
