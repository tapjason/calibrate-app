// When the rating can unlock, at the person's own pace (roadmap D53).
//
// Layer rule: engine — imports only from @/types and sibling engine files.
//
// A tester asked "how many days at my pace?" and found nothing (blind
// playtest 2026-11-09b, finding 2). This is an estimate, said as one: scored
// answers per day over the recent window, and the days the rest would take at
// that rate. Nothing else is guessed: no estimate with fewer than
// PACE_MIN_ANSWERS in the window, where one answer read as "4 months".

import type { Prediction, UnlockEstimate } from '@/types';

/** The recent window the pace is read over, in days. */
export const PACE_WINDOW_DAYS = 28;
/** A pace read over fewer days than this is read over this many. */
export const PACE_MIN_DAYS = 7;
/** Answers in the window before there's a pace to estimate from (record audit, 2026-11-09). */
export const PACE_MIN_ANSWERS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `scored` are the scored Yes/No answers (same-day answers already left out,
 * D41); `firstActivityAt` is when the first prediction was logged, so a new
 * person's pace is read over the days they've had, never fewer than
 * PACE_MIN_DAYS. Null when nothing remains, or there's no pace to go on.
 */
export function unlockEstimate(
  scored: readonly Prediction[],
  total: number,
  now: Date,
  firstActivityAt: string | null,
): UnlockEstimate | null {
  const remaining = total - scored.length;
  if (remaining <= 0) return null;
  const nowMs = now.getTime();
  const first = firstActivityAt ? Date.parse(firstActivityAt) : NaN;
  const since = Number.isNaN(first) ? PACE_WINDOW_DAYS : (nowMs - first) / DAY_MS;
  const windowDays = Math.min(PACE_WINDOW_DAYS, Math.max(PACE_MIN_DAYS, since));
  const from = nowMs - windowDays * DAY_MS;
  let recent = 0;
  for (const p of scored) {
    const at = p.resolved_at ? Date.parse(p.resolved_at) : NaN;
    if (!Number.isNaN(at) && at > from && at <= nowMs) recent += 1;
  }
  if (recent < PACE_MIN_ANSWERS) return null;
  const days = Math.max(1, Math.ceil(remaining / (recent / windowDays)));
  return { remaining, days, at: new Date(nowMs + days * DAY_MS) };
}
