// How long an answer stays open to correction (roadmap D34, decided
// 2026-11-01), how long a "Can't tell" stays open to an answer, and which
// deletions are counted (both D45, decided 2026-11-06).
//
// Layer rule: L3, imports from @/types and sibling engine modules only.

import type { Prediction } from '@/types';

import { localDayNumber, localMidnight, localParts } from './localTime';
import { dayNumberAt, isSameDayAnswer, madeDayNumber } from './sameDay';

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
 * window), or an open one deleted from the day before its due day, when the
 * outcome may be known: the same window as a counted due-date move (D61,
 * record audit 2026-11-13; it was from the due day, so a likely miss deleted
 * on the eve went uncounted while moving its date counted). Not on the day
 * it was made, when nothing has happened since it was logged: a slip fixed
 * by deleting and logging again isn't a hidden outcome. Not a skip, a
 * same-day answer or an open one further off: none of those was scored.
 */
export function deletionCounts(p: Prediction, now: Date): boolean {
  if (p.status === 'resolved_yes' || p.status === 'resolved_no') return !isSameDayAnswer(p);
  return lateForOpen(p, now);
}

/**
 * Whether moving this answered prediction to another category counts on
 * Insights (step 184, D65): a scored Yes or No. Each category's score follows
 * where an answer is filed, so a scored miss moved out leaves that category's
 * score. Not a "Can't tell" or a same-day answer: neither was scored, so
 * moving one hides nothing. The same test as a counted delete of an answered
 * prediction (D45).
 */
export function refileCounts(p: Prediction): boolean {
  return (p.status === 'resolved_yes' || p.status === 'resolved_no') && !isSameDayAnswer(p);
}

/**
 * Whether an open prediction is late now: on or after its due day, or on the
 * eve of it unless it was made (or reworded) today. The window shared by a
 * counted delete (D61), a counted due-date move and a counted rewording
 * (D62): by then the outcome may be known, while a change on the day it was
 * made is a slip fixed, not a hidden outcome. The day it was made is read
 * where it was made, as the same-day rule reads it (2026-11-19); today, where
 * the phone is now.
 */
function lateForOpen(p: Prediction, now: Date): boolean {
  if (p.status !== 'pending') return false;
  const due = new Date(p.due_date);
  if (Number.isNaN(due.getTime())) return false;
  const today = localDayNumber(now);
  const dueDay = localDayNumber(due);
  if (today >= dueDay) return true;
  if (today !== dueDay - 1) return false;
  const made = madeDayNumber(p);
  return Number.isNaN(made) || made < today;
}

/**
 * Whether moving an open prediction's due date counts on Insights (step 173,
 * aggregate B1; record audit 2026-11-12): moved later, on or after the day
 * before its old due day. By then the outcome may be known, and a known miss
 * moved on and answered later read as a hit. "On or after the due day" alone
 * counted almost nothing, since from its due day a prediction opens on
 * Resolve, which has no Edit. Moving earlier is never counted. Not on the
 * day it was made (D62, blind playtest 2026-11-13d, run 5: a date fixed two
 * minutes after logging read as "being called a cheat"), the same exemption
 * as a delete (D61); `madeIso` is when it counts as made before this edit
 * (`scoredFrom`), so a rewording on the due day still counts its move, and
 * `madeUtcOffsetMin` the offset stored for it (`scoredFromOffset`), so that
 * day is read where it was made (2026-11-19). Days by the phone's clock, as
 * for the other rules (D45).
 */
export function postponementCounts(
  oldDueIso: string,
  newDueIso: string,
  now: Date,
  madeIso?: string,
  madeUtcOffsetMin?: number | null,
): boolean {
  const oldDay = localDayNumber(new Date(oldDueIso));
  const newDay = localDayNumber(new Date(newDueIso));
  if (newDay <= oldDay) return false;
  const today = localDayNumber(now);
  if (today < oldDay - 1) return false;
  if (madeIso === undefined) return true;
  const made = dayNumberAt(new Date(madeIso), madeUtcOffsetMin);
  return Number.isNaN(made) || made !== today;
}

/**
 * Whether moving an open prediction to another category now counts on
 * Insights (owner decision 2026-11-19; record audit: a likely miss moved out
 * of its category before it was answered left no trace, while the same move
 * after the answer is counted, D65). The window and exemption of a counted
 * due-date move: on or after the day before its due day, by when the outcome
 * may be known, and not on the day it was made (`madeDayNumber`: logged, or
 * last reworded), when a change is a slip fixed (D62). Counted beside the late
 * moves and rewordings, once per prediction. The caller decides whether the
 * category changed. An unreadable due date isn't counted; an unreadable made
 * time doesn't exempt it, as for a move.
 */
export function categoryChangeCounts(p: Prediction, now: Date): boolean {
  if (p.status !== 'pending') return false;
  const due = new Date(p.due_date);
  if (Number.isNaN(due.getTime())) return false;
  const today = localDayNumber(now);
  if (today < localDayNumber(due) - 1) return false;
  const made = madeDayNumber(p);
  return Number.isNaN(made) || made !== today;
}

/**
 * Whether changing an open prediction's words now counts on Insights (D62,
 * record audit of step 173): new words on the eve of its due day keep that
 * date, since tomorrow is a reworded prediction's earliest due date (D45), so
 * a call whose outcome was in sight could be rewritten into one that will
 * happen and answered, scored, the next day. Counted in the same window as a
 * late move or delete, once per prediction, beside them. On the due day new
 * words push the date to tomorrow, and that move is counted already. The
 * caller decides whether the words are new (D32's `titleKey`).
 */
export function rewordingCounts(p: Prediction, now: Date): boolean {
  return lateForOpen(p, now);
}
