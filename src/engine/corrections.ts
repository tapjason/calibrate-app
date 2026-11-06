// How long an answer stays open to correction (roadmap D34, decided
// 2026-11-01), how long a "Can't tell" stays open to an answer, and which
// deletions are counted (both D45, decided 2026-11-06).
//
// Layer rule: L3, imports from @/types and sibling engine modules only.

import type { Prediction } from '@/types';

import { localDayNumber, localMidnight, localParts } from './localTime';
import { isSameDayAnswer } from './sameDay';

/**
 * For this long after a Yes or No, its details can change the answer, move it
 * to another category or delete it; after that it is the record. Long enough
 * to catch a mis-tap or a misfiled one the next day, short enough that an
 * answer can't be rewritten once its outcome is old news.
 */
export const CORRECTION_WINDOW_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/**
 * When the window closes for an answered prediction, or null for one that
 * has none: open, a skip (a skip can be answered later instead, roadmap step
 * 39), or a row with no readable answer time. Measured from the first answer:
 * a correction keeps `resolved_at`, so correcting can't stretch the window.
 */
export function correctableUntil(p: Prediction): Date | null {
  if (p.status !== 'resolved_yes' && p.status !== 'resolved_no') return null;
  if (p.resolved_at === null) return null;
  const at = new Date(p.resolved_at).getTime();
  if (Number.isNaN(at)) return null;
  return new Date(at + CORRECTION_WINDOW_HOURS * HOUR_MS);
}

/** Whether a Yes or No can still be corrected, re-filed or deleted now. */
export function canCorrect(p: Prediction, now: Date): boolean {
  const until = correctableUntil(p);
  return until !== null && now.getTime() < until.getTime();
}

/**
 * Days after its due day that a "Can't tell" can still be answered (roadmap
 * D45). It was open forever, so a call that looked bad could be parked as a
 * skip and only the good ones answered later (blind playtest 2026-11-05,
 * three runs). A week covers an outcome that takes a few days to be known.
 */
export const SKIP_ANSWER_DAYS = 7;

/**
 * The last local day a "Can't tell" can still be answered, at its local
 * midnight, or null for anything that isn't a skip or has no readable due
 * date. SKIP_ANSWER_DAYS after the due day, and never sooner than the day the
 * correction window closes: a skip given late, to clear a backlog, keeps a
 * day to undo a mis-tap (roadmap step 39).
 */
export function skipLastDay(p: Prediction): Date | null {
  if (p.status !== 'skipped') return null;
  const due = new Date(p.due_date);
  if (Number.isNaN(due.getTime())) return null;
  const d = localParts(due);
  let last = localMidnight(d.year, d.month, d.day + SKIP_ANSWER_DAYS);
  const answered = p.resolved_at ? new Date(p.resolved_at).getTime() : NaN;
  if (!Number.isNaN(answered)) {
    const windowEnd = localParts(new Date(answered + CORRECTION_WINDOW_HOURS * HOUR_MS));
    const windowDay = localMidnight(windowEnd.year, windowEnd.month, windowEnd.day);
    if (windowDay.getTime() > last.getTime()) last = windowDay;
  }
  return last;
}

/** Whether a "Can't tell" can still be answered now (D45). */
export function canAnswerSkip(p: Prediction, now: Date): boolean {
  const last = skipLastDay(p);
  return last !== null && localDayNumber(now) <= localDayNumber(last);
}

/**
 * Whether deleting this prediction now is counted on Insights (roadmap D45):
 * a scored Yes or No (which can only be deleted inside the correction
 * window), or an open one deleted on or after its due day, when the outcome
 * may be known. Not a skip, a same-day answer or an open one not yet due:
 * none of those was scored, so deleting them hides nothing.
 */
export function deletionCounts(p: Prediction, now: Date): boolean {
  if (p.status === 'resolved_yes' || p.status === 'resolved_no') return !isSameDayAnswer(p);
  if (p.status !== 'pending') return false;
  const due = new Date(p.due_date);
  if (Number.isNaN(due.getTime())) return false;
  return localDayNumber(now) >= localDayNumber(due);
}
