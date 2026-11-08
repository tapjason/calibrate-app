// Same-day answers aren't scored (roadmap D41, decided 2026-11-03).
//
// A Yes or No given on the local day the prediction was logged stays in
// History but counts toward nothing calibrated: the rating, category scores
// and badges, the chart, the Brier line, the patterns, Wrapped and the Coach.
// Logging a sure thing, answering it at once and repeating it with "Log it
// again" bought a badge in three minutes (blind playtests 2026-11-01 and
// 2026-11-03). The streak still counts the answer, as it counts the logging.
//
// Derived on every read from created_at and resolved_at, never stored, so
// no migration and every device agrees (each on its own local day). A
// correction keeps the first answer's time (D34), so it can't move an
// answer to another day.
//
// A reworded prediction counts as logged when it was reworded (roadmap D45,
// decided 2026-11-06): "The Fed holds rates" at 70% turned into "The Fed
// does NOT hold rates" at 70% on the day the news came out, the same as
// moving the number to 30% after the fact (blind playtest 2026-11-05).
//
// Layer rule: imports @/types and ./localTime only.

import type { Prediction } from '@/types';

import { localDayNumber } from './localTime';

/**
 * When the prediction, as it now reads, was made (roadmap D45): when it was
 * logged, or when its words last changed if that's later. `created_at` itself
 * never moves, since the streak counts the day of logging.
 */
export function scoredFrom(p: Pick<Prediction, 'created_at' | 'title_edited_at'>): string {
  const edited = p.title_edited_at;
  if (!edited) return p.created_at;
  const e = new Date(edited).getTime();
  if (Number.isNaN(e)) return p.created_at;
  const c = new Date(p.created_at).getTime();
  if (Number.isNaN(c)) return edited;
  return e > c ? edited : p.created_at;
}

/**
 * A Yes or No given on the local day the prediction was logged, or reworded
 * (D45).
 */
export function isSameDayAnswer(p: Prediction): boolean {
  if (p.status !== 'resolved_yes' && p.status !== 'resolved_no') return false;
  if (!p.resolved_at) return false;
  const answered = new Date(p.resolved_at);
  const logged = new Date(scoredFrom(p));
  if (Number.isNaN(answered.getTime()) || Number.isNaN(logged.getTime())) return false;
  return localDayNumber(answered) === localDayNumber(logged);
}

/** The answered predictions that are scored: all but same-day answers. */
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
 */
export function earliestDueDay(createdAt: Date, now: Date): Date {
  const next = new Date(createdAt);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);
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
 * unreadable date also becomes the earliest day.
 */
export function clampDueDate(dueIso: string, createdAt: Date, now: Date): string {
  const earliest = earliestDueDay(createdAt, now);
  const due = new Date(dueIso);
  if (!Number.isNaN(due.getTime()) && due >= earliest) return dueIso;
  return new Date(
    earliest.getFullYear(),
    earliest.getMonth(),
    earliest.getDate(),
    12,
  ).toISOString();
}
