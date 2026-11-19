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
// first answer's time (D34), so it can't move an answer to another day.
//
// **Judged in the zone the prediction was made in** (owner decision
// 2026-11-19, review round 6, refining D69 (f)). The prediction stores the
// UTC offset the phone was in when it was logged, and when it was reworded
// (D45); "the same day" is read in the offset stored with `scoredFrom`'s
// moment, for both sides: the day it was made, and the day of the answer.
// Never in the zone the answer was given in. Round 5 read each moment in its
// own offset, and the record auditor scored 20 sure things logged at 08:00 in
// New York and answered at once after setting the phone to UTC+14, a badge in
// minutes. Before round 5 every day was read in the phone's zone at the time
// of reading, so moving the phone re-scored past answers (20 same-day answers
// in New York all counted once the phone was in London).
//
// A traveller who answers early abroad is unscored until the next day has
// begun where the prediction was made (the fail-safe direction): logged
// Wednesday evening in New York, an answer at 03:00 Thursday in London is
// 22:00 Wednesday in New York, the day it was made.
//
// With no stored offset for that moment (every row from before SQLite
// migration 018, a row pulled from another phone before sync carries it, or
// an offset that isn't usable), both sides are read in the phone's current
// zone, exactly as before D69.
//
// Known limit of storing an offset rather than a zone: across a daylight
// saving change between the two moments, the boundary moves by the change.
// After clocks go forward the first hour of the next day still reads as the
// day it was made (unscored, the safe side). On the day clocks go back, a
// prediction logged in the night before the change (at the summer offset)
// and answered in that day's last hour reads as answered the next day.
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
 * scale `localDayNumber` counts on), read in the UTC offset given, or in the
 * phone's current zone when there is none (or it isn't usable). NaN for an
 * unreadable date.
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
 * rewording's when that's the later one. Null when none was stored. Every
 * day the same-day rule reads for this prediction is read in it.
 */
export function scoredFromOffset(p: MadeFields): number | null {
  const offset = editedIsLater(p) ? p.title_edited_utc_offset_min : p.created_utc_offset_min;
  return offset ?? null;
}

/**
 * The calendar day of `at` as this prediction's days are read: in the offset
 * stored with `scoredFrom`'s moment (round 6), or in the phone's current zone
 * without one. NaN for an unreadable date.
 */
export function dayNumberWhereMade(p: MadeFields, at: Date): number {
  return dayNumberAt(at, scoredFromOffset(p));
}

/**
 * The calendar day the prediction, as it now reads, was made, where it was
 * made (`scoredFrom` in its own offset). NaN when unreadable.
 */
export function madeDayNumber(p: MadeFields): number {
  return dayNumberWhereMade(p, new Date(scoredFrom(p)));
}

/**
 * Whether `at` falls on the calendar day the prediction (as it now reads)
 * was made, both read where it was made (`dayNumberWhereMade`). False when
 * either is unreadable. The test behind same-day answers (D41, D45) and the
 * "made today" exemption of a late rewording (D62; a late due-date move reads
 * the same day through `postponementCounts`' own arguments); a delete and a
 * category move go by the day it was logged instead (`isOnLoggedDay`,
 * round 7).
 */
export function isOnMadeDay(p: MadeFields, at: Date): boolean {
  const made = madeDayNumber(p);
  const day = dayNumberWhereMade(p, at);
  if (Number.isNaN(made) || Number.isNaN(day)) return false;
  return made === day;
}

/**
 * Whether `at` falls on the calendar day the prediction was logged
 * (`created_at`), both read in the offset stored when it was logged, or in
 * the phone's current zone without one. False when either is unreadable.
 *
 * Unlike `isOnMadeDay`, new words don't move this day (owner decision
 * 2026-11-19, review round 7): it is the exemption for a delete or a
 * category move "on the day it was made", when nothing has happened since it
 * was logged. A rewording later on is a change to an existing prediction,
 * and it didn't reset the exemption: rewording, moving it the same day and
 * answering the next left the move uncounted (the record auditor's route E).
 * Also the day "Use another number" stays open (D62, `canRenumber`).
 */
export function isOnLoggedDay(
  p: Pick<Prediction, 'created_at' | 'created_utc_offset_min'>,
  at: Date,
): boolean {
  const offset = p.created_utc_offset_min;
  const logged = dayNumberAt(new Date(p.created_at), offset);
  const day = dayNumberAt(at, offset);
  if (Number.isNaN(logged) || Number.isNaN(day)) return false;
  return logged === day;
}

/**
 * A Yes or No given on the calendar day the prediction was logged, or
 * reworded (D45), both days read in the zone it was made in (round 6).
 */
export function isSameDayAnswer(p: Prediction): boolean {
  if (p.status !== 'resolved_yes' && p.status !== 'resolved_no') return false;
  if (!p.resolved_at) return false;
  return isOnMadeDay(p, new Date(p.resolved_at));
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
 * With the offset stored for `createdAt`, "the next day" is the calendar date
 * after the one it was made on where it was made, taken as that date on the
 * phone. At logging the two agree, the offset being the phone's own. After
 * the phone has moved east, an answer early on that date can still fall on
 * the day it was made where it was made, and isn't scored (round 6); the
 * same-day rule decides at the answer, never this floor.
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
 * playtest 2026-11-13c, finding 19). "Due today or earlier" is the phone's
 * day, as every list shows a due date; "scored now" is the same-day rule's
 * reading, both days where it was made (round 6).
 */
export function readyScoredCount(pending: readonly Prediction[], now: Date): number {
  const today = localDayNumber(now);
  return pending.filter((p) => {
    if (p.status !== 'pending') return false;
    const due = new Date(p.due_date);
    const made = madeDayNumber(p);
    if (Number.isNaN(due.getTime()) || Number.isNaN(made)) return false;
    return localDayNumber(due) <= today && made !== dayNumberWhereMade(p, now);
  }).length;
}
