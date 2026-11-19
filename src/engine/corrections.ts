// How long an answer stays open to correction (roadmap D34, decided
// 2026-11-01), how long a "Can't tell" stays open to an answer, and which
// deletions are counted (both D45, decided 2026-11-06).
//
// Layer rule: L3, imports from @/types and sibling engine modules only.

import type { Category, CategoryOrigin, Prediction } from '@/types';

import { localDayNumber, localMidnight, localParts } from './localTime';
import { dayNumberAt, isOnLoggedDay, isOnMadeDay, isSameDayAnswer } from './sameDay';

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
 * window), or an open one deleted on any day after the day it was logged
 * (owner decision 2026-11-19, review round 7; D61 counted only from the eve
 * of its due day, and an open call deleted two days early left no trace).
 *
 * Not on the day it was logged (`isOnLoggedDay`: that day and today both
 * read in the offset stored when it was logged), when nothing has happened
 * since: a slip fixed by deleting and logging again isn't a hidden outcome.
 * New words don't move that day: one logged earlier and reworded today is
 * counted. Even on that day, one already due is counted (a clock or
 * time-zone change, a synced row; record audit 2026-11-15), as before. An
 * unreadable logging time doesn't exempt it. Not a skip or a same-day
 * answer: neither was scored.
 */
export function deletionCounts(p: Prediction, now: Date): boolean {
  if (p.status === 'resolved_yes' || p.status === 'resolved_no') return !isSameDayAnswer(p);
  if (p.status !== 'pending') return false;
  return !isOnLoggedDay(p, now) || isDueBy(p, now);
}

/** Whether an open prediction's due day (the phone's day) is today or past. */
function isDueBy(p: Prediction, now: Date): boolean {
  const due = new Date(p.due_date);
  if (Number.isNaN(due.getTime())) return false;
  return localDayNumber(now) >= localDayNumber(due);
}

/**
 * Whether moving this answered prediction to another category can count on
 * Insights (step 184, D65): a scored Yes or No. Each category's score follows
 * where an answer is filed, so a scored miss moved out leaves that category's
 * score. Not a "Can't tell" or a same-day answer: neither was scored, so
 * moving one hides nothing. The same test as a counted delete of an answered
 * prediction (D45). Whether a given answer is counted, filed where it is, is
 * `answerCountedAsMoved`.
 */
export function refileCounts(p: Prediction): boolean {
  return (p.status === 'resolved_yes' || p.status === 'resolved_no') && !isSameDayAnswer(p);
}

/**
 * Whether an open prediction is late now: on or after its due day, or on the
 * eve of it unless it was made (or reworded) today. The window of a counted
 * rewording (D62), shared with a counted due-date move: by then the outcome
 * may be known, while a change on the day it was made is a slip fixed, not a
 * hidden outcome. (A delete used it until round 7; it is counted from the
 * day after it was logged now, `deletionCounts`.)
 *
 * The window (the eve, the due day) is the phone's day, as the due date is
 * shown. "Made today" is the same-day rule's reading (`isOnMadeDay`): the day
 * it was made and today both read in the zone it was made in (owner decision
 * 2026-11-19, round 6), so a traveller's day doesn't end early (record
 * audit: a fix 30 minutes after logging was counted after a zone change). An
 * unreadable made time doesn't exempt it.
 */
function lateForOpen(p: Prediction, now: Date): boolean {
  if (p.status !== 'pending') return false;
  const due = new Date(p.due_date);
  if (Number.isNaN(due.getTime())) return false;
  const today = localDayNumber(now);
  const dueDay = localDayNumber(due);
  if (today >= dueDay) return true;
  if (today !== dueDay - 1) return false;
  return !isOnMadeDay(p, now);
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
 * `madeUtcOffsetMin` the offset stored for it (`scoredFromOffset`). The
 * window is the phone's day, as the due date is shown; "made today" reads
 * the day it was made and today both in that offset, as the same-day rule
 * does (round 6), or both in the phone's zone without one. Days by the
 * phone's clock, as for the other rules (D45).
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
  if (localDayNumber(now) < oldDay - 1) return false;
  if (madeIso === undefined) return true;
  const made = dayNumberAt(new Date(madeIso), madeUtcOffsetMin);
  return Number.isNaN(made) || made !== dayNumberAt(now, madeUtcOffsetMin);
}

/**
 * Whether moving an open prediction to another category now counts on
 * Insights (owner decision 2026-11-19; record audit: a likely miss moved out
 * of its category before it was answered left no trace, while the same move
 * after the answer is counted, D65). The window of a counted due-date move:
 * on or after the day before its due day (the phone's day), by when the
 * outcome may be known. Not on the day it was logged (`isOnLoggedDay`, read
 * where it was logged), when a change is a slip fixed (D62), the due day
 * included; new words don't move that day (owner decision 2026-11-19, review
 * round 7: a rewording used to, so a move the day of a rewording went
 * uncounted). Counted beside the late moves and rewordings, once per
 * prediction. The caller decides whether the category changed. An
 * unreadable due date isn't counted; an unreadable logging time doesn't
 * exempt it, as for a move.
 */
export function categoryChangeCounts(p: Prediction, now: Date): boolean {
  if (p.status !== 'pending') return false;
  const due = new Date(p.due_date);
  if (Number.isNaN(due.getTime())) return false;
  if (localDayNumber(now) < localDayNumber(due) - 1) return false;
  return !isOnLoggedDay(p, now);
}

// ---- A category change counted at the answer (owner decision 2026-11-19,
// review round 6, widening D69 (e)) ----
//
// D69 (e) counts a category change from the eve of the due day. A change two
// or more days early, then "Answer it now", left no trace (reproduced): a
// likely miss moved out of its category took that category's score with it.
// So this phone remembers the category an open prediction had when it was
// first moved after the day it was logged (`CategoryOrigin`): the category it
// had at the end of that day. Moved back before the answer, nothing is
// counted.
//
// The rule (review round 7), a function of where the answer ends up and
// never of the path it took there (`answerCountedAsMoved`, worked out afresh
// at the answer and after every move of it; the moves before don't enter):
// a scored answer is on the moved-answers line (D65) while it sits in a
// different category from the one it had at the end of the day it was
// logged, which is the remembered category, or where it was answered when
// nothing is remembered. A category change made while it was open, from the
// eve of its due day but not on the day it was logged, is counted once, on
// the late-changes line, when it is made (`categoryChangeCounts`), and the
// answer isn't counted again for it: not while it sits where it was answered,
// and not back in that end-of-day category. Only a move of the answer to a
// third category, neither of those two, puts it on the moved-answers line,
// beside the late change, as a move of any answer away from where it belongs
// is (D65); moved back to either, it comes off again. Deleted, it is counted
// once, as a deletion. (Until round 7 the line was kept by adding and
// removing a row move by move, and passing through the end-of-day category
// on the way back could leave one counted where the direct way back didn't.)

/**
 * Whether moving an open prediction to another category now makes this
 * phone remember the category it had: any move after the day it was logged
 * (`isOnLoggedDay`, read where it was logged). A move on that day is a slip
 * fixed, as for every late change (D62), and remembers nothing. New words
 * don't move that day (owner decision 2026-11-19, review round 7: they did,
 * so rewording, moving it the same day and answering the next was never
 * counted, the record auditor's route E). Only the first remembered category
 * is kept. The caller decides whether the category changed. An unreadable
 * logging time remembers it, the side that counts.
 */
export function categoryChangeRemembered(p: Prediction, now: Date): boolean {
  if (p.status !== 'pending') return false;
  return !isOnLoggedDay(p, now);
}

/**
 * Whether answer `p`, filed where it is now, is on the moved-answers line
 * (D65, review rounds 6 and 7): a function of where it ends up, never of the
 * path it took there, so the store works it out afresh at the answer and
 * after every move of it and keeps one row or none to match.
 *
 * - Only a scored Yes or No (`refileCounts`: not a "Can't tell", not a
 *   same-day answer): moving one that wasn't scored hides nothing.
 * - Counted while it sits in a different category from the one it had at
 *   the end of the day it was logged: `origin.from_category` when this phone
 *   remembers one (its first move while open after that day), else
 *   `answeredIn`, since nothing moved it between that day's end and the
 *   answer.
 * - When a category change on it was counted as a late change
 *   (`origin.counted_late`: from the eve of its due day, not on the day it
 *   was logged), that line holds it once: sitting where it was answered, it
 *   isn't counted again. Moved on to a third category, neither that one nor
 *   the end-of-day one, it is counted, as any answer moved away from where
 *   it belongs is.
 *
 * `answeredIn` is the category it was answered in (`answeredCategory`).
 * Deleted, it is counted as a deletion instead (D65): the store's delete
 * removes its row.
 */
export function answerCountedAsMoved(
  p: Prediction,
  answeredIn: Category,
  origin: Pick<CategoryOrigin, 'from_category' | 'counted_late'> | null,
): boolean {
  if (!refileCounts(p)) return false;
  const endOfLoggedDay = origin ? origin.from_category : answeredIn;
  if (p.category === endOfLoggedDay) return false;
  if (origin?.counted_late && p.category === answeredIn) return false;
  return true;
}

/**
 * The category an answer was answered in, as this phone can tell, for
 * `answerCountedAsMoved` (review round 7): `recorded`, written on the
 * remembered category's row beside the answer (SQLite migration 022), when
 * there is one; else `countedFrom`, the moved-answers row's `from_category`,
 * which holds where it was answered while it is counted; else `before`, its
 * category before the move being worked out: with nothing written, nothing
 * has moved it on this phone since it was answered. An answer given on
 * another phone and moved there too is read from where it arrived; this
 * phone's counts are its own (D65).
 */
export function answeredCategory(
  before: Category,
  recorded: Category | null,
  countedFrom: Category | null,
): Category {
  return recorded ?? countedFrom ?? before;
}

/**
 * For Edit (round 6): whether moving open prediction `p` to `category` now
 * would be counted once it is answered there with a scored Yes or No (on the
 * moved-answers line). `origin` is the category this phone remembers for it,
 * or null. False when the move would be counted now instead, as a late
 * change (`categoryChangeCounts`, which Edit already says), when a category
 * change on it was counted that way before, when it isn't a move, when the
 * category is the remembered one (moved back), and on the day it was logged
 * with nothing remembered (a slip fixed; a rewording doesn't move that day,
 * round 7). An answer given the day it was made (logged or reworded), or
 * "Can't tell", is never counted; Edit can't know which it will be.
 */
export function categoryChangeCountedIfAnswered(
  p: Prediction,
  category: Category,
  origin: Pick<CategoryOrigin, 'from_category' | 'counted_late'> | null,
  now: Date,
): boolean {
  if (p.status !== 'pending' || category === p.category) return false;
  if (categoryChangeCounts(p, now)) return false;
  if (origin?.counted_late) return false;
  const from = origin
    ? origin.from_category
    : categoryChangeRemembered(p, now)
      ? p.category
      : null;
  return from !== null && category !== from;
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
