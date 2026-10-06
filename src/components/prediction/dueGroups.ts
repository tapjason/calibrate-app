// Presentation helper: group open predictions by when they come due, for the
// Today list (DESIGN_SYSTEM §7.11).
//
// The group header carries the state, so no card has to: a prediction whose
// day has come is "Ready to resolve", not an amber "Overdue". Coming due is
// not a lapse — the user doesn't choose when the world answers.
//
// Days are the device's local calendar days, like the streak engine: "due
// today" means the user's today.

import type { Prediction } from '@/types';

export interface DueGroup {
  key: 'ready' | 'week' | 'later';
  title: string;
  data: Prediction[];
}

const TITLES: Record<DueGroup['key'], string> = {
  ready: 'Ready to resolve',
  // The next seven days, not the calendar week (roadmap step 67): on a
  // Tuesday, "In a week" lands next Tuesday, which "This week" called this
  // week. Share's "This week" is the calendar week; this one isn't.
  week: 'Next 7 days',
  later: 'Later',
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Whole local days from today until the due date: 0 = due today, negative =
 * the day has passed. Rounded, so a DST shift inside the span can't turn one
 * day into 0.96 of one.
 */
export function daysUntilDue(prediction: Prediction, now: Date): number {
  const due = new Date(prediction.due_date);
  return Math.round((startOfLocalDay(due) - startOfLocalDay(now)) / DAY_MS);
}

/** A prediction whose due day is today or earlier can be answered now. */
export function isReadyToResolve(prediction: Prediction, now: Date): boolean {
  return prediction.status === 'pending' && daysUntilDue(prediction, now) <= 0;
}

/**
 * Non-empty groups in reading order, each sorted soonest first. Predictions
 * with an unparseable due date go to "Later" rather than vanishing.
 */
export function groupByDue(pending: readonly Prediction[], now: Date): DueGroup[] {
  const buckets: Record<DueGroup['key'], Prediction[]> = { ready: [], week: [], later: [] };

  for (const p of pending) {
    const days = daysUntilDue(p, now);
    if (Number.isNaN(days)) buckets.later.push(p);
    else if (days <= 0) buckets.ready.push(p);
    else if (days <= 7) buckets.week.push(p);
    else buckets.later.push(p);
  }

  const byDue = (a: Prediction, b: Prediction) =>
    (Date.parse(a.due_date) || Infinity) - (Date.parse(b.due_date) || Infinity);

  return (['ready', 'week', 'later'] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, title: TITLES[key], data: [...buckets[key]].sort(byDue) }));
}

/**
 * One line for the calibrating hero (roadmap step 32): when the next answer
 * can come. Resolutions arrive only as predictions fall due, which the user
 * doesn't control, so the wait gets a date. Null with nothing open.
 */
export function nextDueLine(
  pending: readonly Prediction[],
  now: Date,
  /** Nothing has resolved yet, so the soonest is the first, not the next (step 69). */
  { first = false }: { first?: boolean } = {},
): string | null {
  const open = pending.filter((p) => p.status === 'pending');
  if (open.length === 0) return null;

  const ready = open.filter((p) => isReadyToResolve(p, now)).length;
  if (ready === 1) return 'One is ready to resolve now.';
  if (ready > 1) return `${ready} are ready to resolve now.`;

  const next = open
    .map((p) => Date.parse(p.due_date))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b)[0];
  if (next === undefined) return null;
  const day = new Date(next).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  // No-break spaces hold the date together: "Oct" ended one line and "13."
  // began the next.
  return `The ${first ? 'first' : 'next'} one comes due ${day.replace(/ /g, '\u00A0')}.`;
}

/**
 * Open predictions that can be answered within `days` from today, the ones
 * already ready included. The empty weekly recap counts these as "on the way"
 * (roadmap step 34).
 */
export function dueWithin(pending: readonly Prediction[], now: Date, days: number): number {
  return pending.filter((p) => {
    if (p.status !== 'pending') return false;
    const d = daysUntilDue(p, now);
    return !Number.isNaN(d) && d <= days;
  }).length;
}
