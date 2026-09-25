// Streak calculation. Pure function — like calibration.ts, this module may
// only import from @/types and sibling engine files.
//
// Days are the device's LOCAL calendar days. A streak is a human idea ("I
// resolved something every day this week"), and in UTC a Pacific-time user
// who resolves at 10:00 Monday and 18:00 Tuesday has resolved on Monday and
// Wednesday — a gap they never made. The time zone isn't a question of
// trusting the clock: the offset is on the device, offline.
//
// Expiry: given `now`, a streak whose latest day is before yesterday has
// ended and reads 0. Yesterday still counts, so a streak doesn't vanish at
// midnight before the user has had a chance to extend it today. Without
// `now` the streak is anchored at the latest resolution (the old behavior,
// kept for callers with no clock to offer).

import type { ComputeStreak, Prediction } from '@/types';

import { localDayNumber } from './localTime';

export const computeStreak: ComputeStreak = (resolved, opts) => {
  // Only yes/no resolutions count: a skip is an explicit "don't score this",
  // and letting it carry the streak would reward the user for dismissing
  // their own predictions — against the integrity-first design.
  const days = new Set<number>();
  for (const p of resolved) {
    if (!isYesNo(p)) continue;
    if (p.resolved_at) days.add(localDayNumber(new Date(p.resolved_at)));
  }
  if (days.size === 0) return 0;

  const sorted = [...days].sort((a, b) => b - a);

  if (opts?.now && sorted[0]! < localDayNumber(opts.now) - 1) return 0;

  // Walk backwards as long as each day is exactly one before the previous.
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1]! - sorted[i]! !== 1) break;
    streak += 1;
  }
  return streak;
};

function isYesNo(p: Prediction): boolean {
  return p.status === 'resolved_yes' || p.status === 'resolved_no';
}
