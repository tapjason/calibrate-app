// Presentation helper for "Log it again" (roadmap step 22): the Log form's
// starting point when a resolved prediction is logged a second time.
//
// The title and category carry over, and so does the lead time: a call made a
// week ahead is due a week from today. The confidence does not. It starts
// fresh at the form's default, because copying last time's number would anchor
// the new call to the old one; the track record under the slider (step 19)
// already shows how that band has gone.

import type { Category, Prediction } from '@/types';

export interface LogAgainDraft {
  /** The prediction being repeated, so a screen can tell one draft from the next. */
  sourceId: string;
  title: string;
  category: Category;
  /** ISO due date: noon local, `leadDays` from today. */
  dueIso: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Noon local time, `days` from `now`. Noon keeps the UTC timestamp on the same
 * calendar date for every zone between UTC−12 and UTC+12. The Log form's date
 * chips use this too, so a repeated "In a week" lands on that chip exactly.
 */
export function noonInDays(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Whole local days between logging and the due date, at least 1: a call made
 * and due on the same day comes back due tomorrow, never already overdue.
 */
export function leadDays(prediction: Pick<Prediction, 'created_at' | 'due_date'>): number {
  const created = new Date(prediction.created_at);
  const due = new Date(prediction.due_date);
  const days = Math.round((startOfLocalDay(due) - startOfLocalDay(created)) / DAY_MS);
  return Number.isFinite(days) ? Math.max(1, days) : 7;
}

export function logAgainDraft(prediction: Prediction, now: Date = new Date()): LogAgainDraft {
  return {
    sourceId: prediction.id,
    title: prediction.title,
    category: prediction.category,
    dueIso: noonInDays(leadDays(prediction), now),
  };
}
