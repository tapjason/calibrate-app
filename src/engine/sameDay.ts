// Same-day answers aren't scored (roadmap D41, decided 2026-11-03).
//
// A Yes or No given on the local day the prediction was logged stays in
// History but counts toward nothing calibrated: the rating, category scores
// and badges, the chart, the Brier line, the patterns, Wrapped and the Coach.
// Logging a sure thing, answering it at once and repeating it with "Log it
// again" bought a badge in three minutes (blind playtests 2026-11-01 and
// 2026-11-03). The streak still counts the answer, as it counts the logging.
//
// Derived on every read, never stored as a verdict. A correction keeps the
// first answer's time (D34), and its offset, so it can't move an answer to
// another day.
//
// Each moment is read on its own calendar day where it happened (owner
// decision 2026-11-19): the prediction stores the UTC offset the phone was in
// when it was logged, answered and reworded, and a day is taken in that
// offset. It was the phone's zone at the time of reading, so moving the phone
// to another zone re-scored past answers (record audit 2026-11-19: 20
// same-day answers in New York all counted once the phone was in London).
// A moment with no stored offset (every row from before SQLite migration
// 018, and one that came from another phone on an older build) is read in the
// phone's current zone, as before; with one side known and one not, each
// side is read its own way. A traveller who logs in New York in the evening
// and answers the next morning in London answered on the next day.
//
// A reworded prediction counts as logged when it was reworded (roadmap D45,
// decided 2026-11-06): "The Fed holds rates" at 70% turned into "The Fed
// does NOT hold rates" at 70% on the day the news came out, the same as
// moving the number to 30% after the fact (blind playtest 2026-11-05).
//
// Layer rule: imports @/types and ./localTime only.

import { isUtcOffsetMinutes, type Prediction } from '@/types';

import { localDayNumber } from './localTime';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/**
 * The calendar day of an instant, as a day number (days since the epoch, the
 * scale `localDayNumber` counts on), read where it happened: in the UTC
 * offset stored with it, or in the phone's current zone when there is none
 * (or it isn't usable). NaN for an unreadable date.
 */
export function dayNumberAt(date: Date, utcOffsetMin?: number | null): number {
  const t = date.getTime();
  if (Number.isNaN(t)) return NaN;
  if (isUtcOffsetMinutes(utcOffsetMin)) {
    return Math.floor((t + utcOffsetMin * MINUTE_MS) / DAY_MS);
  }
  return localDayNumber(date);
}

type MadeFields = Pick<
  Prediction,
  'created_at' | 'title_edited_at' | 'created_utc_offset_min' | 'title_edited_utc_offset_min'
>;

/** Whether the words' date, not the logging, is when it counts as made. */
function editedIsLater(p: Pick<Prediction, 'created_at' | 'title_edited_at'>): boolean {
  const edited = p.title_edited_at;
  if (!edited) return false;
  const e = new Date(edited).getTime();
  if (Number.isNaN(e)) return false;
  const c = new Date(p.created_at).getTime();
  if (Number.isNaN(c)) return true;
  return e > c;
}

/**
 * When the prediction, as it now reads, was made (roadmap D45): when it was
 * logged, or when its words last changed if that's later. `created_at` itself
 * never moves, since the streak counts the day of logging.
 */
export function scoredFrom(p: Pick<Prediction, 'created_at' | 'title_edited_at'>): string {
  return editedIsLater(p) ? (p.title_edited_at as string) : p.created_at;
}

/**
 * The UTC offset stored with `scoredFrom`'s moment: the logging's, or the
 * rewording's when that's the later one. Null when none was stored.
 */
export function scoredFromOffset(p: MadeFields): number | null {
  const offset = editedIsLater(p) ? p.title_edited_utc_offset_min : p.created_utc_offset_min;
  return offset ?? null;
}

/**
 * The calendar day the prediction, as it now reads, was made, where it was
 * made (`scoredFrom` in its own offset). NaN when unreadable.
 */
export function madeDayNumber(p: MadeFields): number {
  return dayNumberAt(new Date(scoredFrom(p)), scoredFromOffset(p));
}

/**
 * A Yes or No given on the calendar day the prediction was logged, or
 * reworded (D45), each day read where it happened.
 */
export function isSameDayAnswer(p: Prediction): boolean {
  if (p.status !== 'resolved_yes' && p.status !== 'resolved_no') return false;
  if (!p.resolved_at) return false;
  const answered = dayNumberAt(new Date(p.resolved_at), p.resolved_utc_offset_min);
  const logged = madeDayNumber(p);
  if (Number.isNaN(answered) || Number.isNaN(logged)) return false;
  return answered === logged;
}

/** The scored answers that are scored: all but same-day answers. */
export function scoredOnly(resolved: readonly Prediction[]): Prediction[] {
  return resolved.filter((p) => !isSameDayAnswer(p));
}

/** How many answers were given the day they were logged. */
export function sameDayCount(resolved: readonly Prediction[]): number {
  return resolved.filter(isSameDayAnswer).length;
}

/**
 * The earliest due day a prediction logged at `createdAt` can take, at local
 * midnight: the next day, since one answered on the day it was logged isn't
 * scored. Never earlier than today, so an edit can't set a past date.
 *
 * With the offset stored for `createdAt`, "the next day" follows the calendar
 * day it was made on where it was made, as the same-day rule does, so a date
 * offered here is scored when answered on it even after the phone has moved
 * to another zone. At logging the two agree: the offset is the phone's own.
 */
export function earliestDueDay(createdAt: Date, now: Date, utcOffsetMin?: number | null): Date {
  let next: Date;
  if (isUtcOffsetMinutes(utcOffsetMin) && !Number.isNaN(createdAt.getTime())) {
    // That calendar date, as UTC fields, then the day after at local midnight.
    const made = new Date(dayNumberAt(createdAt, utcOffsetMin) * DAY_MS);
    next = new Date(made.getUTCFullYear(), made.getUTCMonth(), made.getUTCDate() + 1);
  } else {
    next = new Date(createdAt);
    next.setHours(0, 0, 0, 0);
    next.setDate(next.getDate() + 1);
  }
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return next > today ? next : today;
}

/**
 * How far ahead Log's and Edit's date pickers go. Pick a date took 12/31/9999
 * (playtest 2026-11-08, finding 6): a prediction no one can answer in their
 * lifetime is a typo, and it sat open in every list. The pickers hold it; the
 * store doesn't, since a far date harms no score.
 */
export const MAX_DUE_YEARS = 2;

/** The latest due day, at local midnight: today, MAX_DUE_YEARS on. */
export function latestDueDay(now: Date): Date {
  const latest = new Date(now);
  latest.setHours(0, 0, 0, 0);
  latest.setFullYear(latest.getFullYear() + MAX_DUE_YEARS);
  return latest;
}

/**
 * A due date no earlier than earliestDueDay, at local noon like the presets.
 * The pickers offer nothing earlier, but a web date field takes a typed date
 * below its min, and a typed year can land in 1906 (blind playtest
 * 2026-11-04, runs 1 and 5), so the store holds the line as well. An
 * unreadable date also becomes the earliest day. `utcOffsetMin` is the offset
 * stored for `createdAt`, as for earliestDueDay.
 */
export function clampDueDate(
  dueIso: string,
  createdAt: Date,
  now: Date,
  utcOffsetMin?: number | null,
): string {
  const earliest = earliestDueDay(createdAt, now, utcOffsetMin);
  const due = new Date(dueIso);
  if (!Number.isNaN(due.getTime()) && due >= earliest) return dueIso;
  return new Date(
    earliest.getFullYear(),
    earliest.getMonth(),
    earliest.getDate(),
    12,
  ).toISOString();
}

/**
 * Open predictions that are due today or earlier and would be scored if
 * answered now: not logged or reworded today (D41, D45). Today's unlock
 * estimate is dropped when these alone would unlock the rating (blind
 * playtest 2026-11-13c, finding 19). An answer now is given in the phone's
 * zone, so today is read there; the day it was made, where it was made, as
 * isSameDayAnswer reads it.
 */
export function readyScoredCount(pending: readonly Prediction[], now: Date): number {
  const today = localDayNumber(now);
  return pending.filter((p) => {
    if (p.status !== 'pending') return false;
    const due = new Date(p.due_date);
    const made = madeDayNumber(p);
    if (Number.isNaN(due.getTime()) || Number.isNaN(made)) return false;
    return localDayNumber(due) <= today && made !== today;
  }).length;
}
