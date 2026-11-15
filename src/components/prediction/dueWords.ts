// Presentation helper: a due date in the words a button says it with
// (roadmap D55): "tomorrow", a weekday within the week, else the date.
//
// Log's Save ("Save, due Sunday") uses it, and "Log it again, due tomorrow"
// (D56) builds on it, adding "in a week" and "in a month" as the chips say them.

import { dateLocale } from '@/constants/locale';
import { logAgainDraft, startOfLocalDay } from '@/components/prediction/logAgain';
import { localDate } from '@/components/ui/dates';
import type { Prediction } from '@/types';

export interface DueWords {
  /** On screen: "tomorrow", "Sunday", "Tue, Nov 17" (no-break spaces). */
  text: string;
  /** To VoiceOver, with nothing abbreviated: "Tuesday, November 17". */
  spoken: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function localDaysUntil(dueIso: string, now: Date): number {
  return Math.round((startOfLocalDay(new Date(dueIso)) - startOfLocalDay(now)) / DAY_MS);
}

/**
 * How a due date reads from `now`: "tomorrow" for the next day, the weekday
 * for two to six days out (one word, and only one day of that name is that
 * close), the short date from a week on, with the year when it isn't this
 * one. The date's own spaces are no-break, so a wrapping label breaks before
 * the date or after the weekday's comma ("Mon," then "Jan 4, 2027"), never
 * between a month and its day.
 */
export function dueWords(dueIso: string, now: Date = new Date()): DueWords {
  const due = new Date(dueIso);
  const days = localDaysUntil(dueIso, now);
  if (days === 0) return { text: 'today', spoken: 'today' };
  if (days === 1) return { text: 'tomorrow', spoken: 'tomorrow' };
  if (days >= 2 && days <= 6) {
    const weekday = due.toLocaleDateString(dateLocale(), { weekday: 'long' });
    return { text: weekday, spoken: weekday };
  }
  const text = localDate(due, { weekday: 'short', day: 'numeric', month: 'short' }, now);
  const spoken = localDate(due, { weekday: 'long', day: 'numeric', month: 'long' }, now);
  // Every space held, then the one after the weekday's comma let go: at the
  // largest text sizes "Mon, Jan 4, 2027" can't fit one line at 320 pt.
  const held = text.replace(/ /g, '\u00A0').replace(',\u00A0', ', ');
  return { text: held, spoken };
}

/**
 * A repeat's date (roadmap D56): "in a week" and "in a month" for exactly
 * those leads, as Log's chips name them; otherwise as Save says it.
 */
export function repeatDueWords(dueIso: string, now: Date = new Date()): DueWords {
  const days = localDaysUntil(dueIso, now);
  if (days === 7) return { text: 'in a week', spoken: 'in a week' };
  if (days === 30) return { text: 'in a month', spoken: 'in a month' };
  return dueWords(dueIso, now);
}

/**
 * The date "Log it again" will bring, from the same draft Log opens with
 * (`logAgainDraft`), so the button and the form name one day: "Log it again,
 * due tomorrow" (roadmap D56).
 */
export function logAgainWords(prediction: Prediction, now: Date = new Date()): DueWords {
  return repeatDueWords(logAgainDraft(prediction, now).dueIso, now);
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
