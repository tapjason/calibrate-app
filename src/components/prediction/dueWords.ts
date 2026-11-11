// Presentation helper: a due date in the words a button says it with
// (roadmap D55): "tomorrow", a weekday within the week, else the date.
//
// Log's Save ("Save, due Sunday") uses it, and "Log it again, due tomorrow"
// (D56) is meant to share it, so the two never word one date two ways.

import { startOfLocalDay } from '@/components/prediction/logAgain';
import { localDate } from '@/components/ui/dates';

export interface DueWords {
  /** On screen: "tomorrow", "Sunday", "Tue, Nov 17" (no-break spaces). */
  text: string;
  /** To VoiceOver, with nothing abbreviated: "Tuesday, November 17". */
  spoken: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const days = Math.round((startOfLocalDay(due) - startOfLocalDay(now)) / DAY_MS);
  if (days === 1) return { text: 'tomorrow', spoken: 'tomorrow' };
  if (days >= 2 && days <= 6) {
    const weekday = due.toLocaleDateString(undefined, { weekday: 'long' });
    return { text: weekday, spoken: weekday };
  }
  const text = localDate(due, { weekday: 'short', day: 'numeric', month: 'short' }, now);
  const spoken = localDate(due, { weekday: 'long', day: 'numeric', month: 'long' }, now);
  // Every space held, then the one after the weekday's comma let go: at the
  // largest text sizes "Mon, Jan 4, 2027" can't fit one line at 320 pt.
  const held = text.replace(/ /g, '\u00A0').replace(',\u00A0', ', ');
  return { text: held, spoken };
}
