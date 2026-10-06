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

import {
  STREAK_DAY_MIN,
  type ComputeStreak,
  type Prediction,
  type StreakStatus,
} from '@/types';

import { localDayNumber } from './localTime';

export { STREAK_DAY_MIN };

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
  return {
    streak: runEndingAt(counted, todayCounts ? today : today - 1),
    today: todayDone,
    todayCounts,
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
