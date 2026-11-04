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
// Layer rule: imports @/types and ./localTime only.

import type { Prediction } from '@/types';

import { localDayNumber } from './localTime';

/** A Yes or No given on the local day the prediction was logged. */
export function isSameDayAnswer(p: Prediction): boolean {
  if (p.status !== 'resolved_yes' && p.status !== 'resolved_no') return false;
  if (!p.resolved_at) return false;
  const answered = new Date(p.resolved_at);
  const logged = new Date(p.created_at);
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
