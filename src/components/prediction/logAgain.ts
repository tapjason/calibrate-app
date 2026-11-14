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
  /**
   * "Use another number" (D62): the open prediction, made today, that saving
   * this draft replaces. The words, category and date carry over as they are;
   * the number starts empty, as always.
   */
  replaces?: string;
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

/** Local midnight of `d`'s day, as a timestamp. Shared with dueWords. */
export function startOfLocalDay(d: Date): number {
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

/**
 * "Use another number" (D62, blind playtest 2026-11-13d, runs 1, 4 and 8): on
 * the day an open prediction was made, Log starts from it with its words,
 * category and own due date, and saving replaces it. The number starts empty:
 * the point is a new one. A delete on the day it was made isn't counted (D61),
 * so nothing hides; from the next day the number is the record.
 */
/**
 * "Use another number" tapped once the prediction can't be replaced (past
 * midnight with Edit open, or answered on another phone meanwhile): what Edit
 * held, as a new prediction, due tomorrow at the earliest (code review, step
 * 179). The old one keeps its number.
 */
export function lateRenumberDraft(draft: LogAgainDraft, now: Date = new Date()): LogAgainDraft {
  const earliest = noonInDays(1, now);
  return {
    ...draft,
    replaces: undefined,
    dueIso: Date.parse(draft.dueIso) < Date.parse(earliest) ? earliest : draft.dueIso,
  };
}

export function renumberDraft(
  prediction: Prediction,
  /**
   * What Edit held when "Use another number" was tapped, so words typed there
   * aren't lost (blind playtest 2026-11-13e, run 2: Log reopened on the old
   * words at midnight). Anything missing or blank keeps the prediction's own.
   */
  edits: { title?: string | null; category?: Category | null; dueIso?: string | null } = {},
): LogAgainDraft {
  const title = edits.title?.trim() ? edits.title : prediction.title;
  const due = edits.dueIso && !Number.isNaN(Date.parse(edits.dueIso)) ? edits.dueIso : null;
  return {
    sourceId: `renumber:${prediction.id}`,
    title,
    category: edits.category ?? prediction.category,
    dueIso: due ?? prediction.due_date,
    replaces: prediction.id,
  };
}
