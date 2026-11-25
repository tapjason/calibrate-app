// Presentation helper: a due date in the words a button or a line says it
// with, through the one wording for a day (`relativeDay`; the owner,
// 2026-11-24): "tomorrow", "in 3 days", "Nov 21 (Friday)".
//
// Log's Save ("Save, due in 3 days", D55) uses it, and "Log it again, due
// tomorrow" (D56), "Logged again, due …" and "Saved, due …" build on it.

import { logAgainDraft } from '@/components/prediction/logAgain';
import { localDaysFrom, relativeDay, type DayWords } from '@/components/ui/dates';
import type { Prediction } from '@/types';

export type DueWords = DayWords;

function localDaysUntil(dueIso: string, now: Date): number {
  return localDaysFrom(now, new Date(dueIso));
}

/**
 * How a due date reads from `now` (`relativeDay`): "today", "tomorrow", "in 2
 * days" to "in 7 days", then the date with its weekday, "Nov 21 (Friday)",
 * with the year when it isn't this one. On screen the words hold together
 * with no-break spaces, so a wrapping label breaks after "due" or before the
 * weekday's bracket, never inside "in 3 days" or between a month and its day.
 */
export function dueWords(dueIso: string, now: Date = new Date()): DueWords {
  return relativeDay(new Date(dueIso), now);
}

/**
 * The date "Log it again" will bring, from the same draft Log opens with
 * (`logAgainDraft`), so the button and the form name one day: "Log it again,
 * due tomorrow" (roadmap D56), in Save's words.
 */
export function logAgainWords(prediction: Prediction, now: Date = new Date()): DueWords {
  return dueWords(logAgainDraft(prediction, now).dueIso, now);
}

/**
 * "Logged again, due tomorrow." for an open repeat, or "Logged again, ready
 * to answer." once its day has come (code review 2026-11-10: a repeat due
 * today read as a bare date).
 */
export function loggedAgainLine(repeatDueIso: string, now: Date = new Date()): string {
  return localDaysUntil(repeatDueIso, now) <= 0
    ? 'Logged again, ready to answer.'
    : `Logged again, due ${dueWords(repeatDueIso, now).text}.`;
}

/**
 * The sign under a closed Log over Insights or History (blind playtests
 * 2026-11-12c runs 6, 7 and 2026-11-12d runs 1, 5: the sheet closed back to an
 * unchanged screen, with no sign the save worked): "Saved, due tomorrow."
 */
export function savedLine(dueIso: string, now: Date = new Date()): string {
  return localDaysUntil(dueIso, now) <= 0
    ? 'Saved, ready to answer.'
    : `Saved, due ${dueWords(dueIso, now).text}.`;
}
