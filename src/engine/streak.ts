// Streak calculation. Pure function — like calibration.ts, this module may
// only import from @/types.
//
// Design choice: the streak is anchored at the LATEST `resolved_at` day in the
// input, not at "real today". That keeps tests deterministic and behaves the
// way an offline user would expect when the device clock is unreliable. The
// trade-off: a streak doesn't "expire" just because today went by without a
// resolution — the next resolution would still chain to yesterday's. When the
// app gets a trusted clock (server time in L5+), switch the anchor to that.

import type { ComputeStreak, Prediction } from '@/types';

/** YYYY-MM-DD slice of an ISO timestamp — UTC day key. */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export const computeStreak: ComputeStreak = (resolved) => {
  // Only yes/no resolutions count: a skip is an explicit "don't score this",
  // and letting it carry the streak would reward the user for dismissing
  // their own predictions — against the integrity-first design.
  const days = new Set<string>();
  for (const p of resolved) {
    if (p.status !== 'resolved_yes' && p.status !== 'resolved_no') continue;
    if (p.resolved_at) days.add(dayKey(p.resolved_at));
  }
  if (days.size === 0) return 0;

  // Most recent day first, then walk backwards as long as each step is exactly
  // one day before the previous.
  const sorted = [...days].sort().reverse();
  let streak = 1;
  let prev = new Date(sorted[0]).getTime();
  for (let i = 1; i < sorted.length; i++) {
    const cur = new Date(sorted[i]).getTime();
    const diffDays = Math.round((prev - cur) / 86_400_000);
    if (diffDays === 1) {
      streak += 1;
      prev = cur;
    } else {
      break;
    }
  }
  return streak;
};
