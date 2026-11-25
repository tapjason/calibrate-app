import { dateLocale } from '@/constants/locale';

/**
 * A date in the person's locale, with the year added whenever it isn't this
 * year's. Without it a prediction due in 9999 read "Fri, Dec 31" everywhere,
 * with the weekday of a different year (playtest 2026-11-08, finding 6), and
 * one logged last November read as this November's.
 */
export function localDate(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  now: Date = new Date(),
): string {
  const withYear =
    date.getFullYear() !== now.getFullYear() ? { ...options, year: 'numeric' as const } : options;
  return date.toLocaleDateString(dateLocale(), withYear);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NBSP = ' ';

/**
 * Local calendar days from `now`'s day to `date`'s: 0 the same day, 1 the
 * next, -1 the one before. Counted on the two local calendar dates, midnight
 * to midnight in the phone's zone, never on the hours between them, so a
 * 23- or 25-hour day at a clock change counts as one and 11:59 PM to 12:01
 * AM is a day.
 */
export function localDaysFrom(now: Date, date: Date): number {
  return Math.round(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      DAY_MS,
  );
}

/**
 * The date with its weekday in brackets, in the phone's own day-and-month
 * order (`dateLocale`, D63): "Nov 21 (Friday)" on a US phone, "21 Nov
 * (Friday)" on a day-first one, with the year only when it isn't this one
 * ("Jan 5, 2027 (Tuesday)"). Plain spaces.
 */
export function dateWithWeekday(date: Date, now: Date = new Date()): string {
  const day = localDate(date, { month: 'short', day: 'numeric' }, now);
  const weekday = date.toLocaleDateString(dateLocale(), { weekday: 'long' });
  return `${day} (${weekday})`;
}

/**
 * A day's words held together for a line on screen: every space no-break
 * except the one before the weekday's bracket, so a narrow line breaks
 * before the words or before "(Friday)", never inside "in 3 days" or
 * between a month and its day.
 */
export function holdDayWords(words: string): string {
  return words.replace(/ /g, NBSP).replace(`${NBSP}(`, ' (');
}

export interface DayWords {
  /** On screen: "today", "in 3 days", "Nov 21 (Friday)", held (`holdDayWords`). */
  text: string;
  /** The same words with plain spaces, for VoiceOver. */
  spoken: string;
}

/**
 * A day named from `now` (the owner, 2026-11-24: "Due in * days makes the
 * most sense, but for dates further out … Due Nov 21 (Friday)"): "today",
 * "tomorrow", "in 2 days" to "in 7 days"; "yesterday", "2 days ago" to "7
 * days ago"; further either way the date with its weekday (`dateWithWeekday`).
 * The one wording for a due date on screen: cards, Log's line and Save, an
 * open prediction's details.
 */
export function relativeDay(date: Date, now: Date = new Date()): DayWords {
  const days = localDaysFrom(now, date);
  let spoken: string;
  if (days === 0) spoken = 'today';
  else if (days === 1) spoken = 'tomorrow';
  else if (days === -1) spoken = 'yesterday';
  else if (days >= 2 && days <= 7) spoken = `in ${days} days`;
  else if (days <= -2 && days >= -7) spoken = `${-days} days ago`;
  else spoken = dateWithWeekday(date, now);
  return { text: holdDayWords(spoken), spoken };
}
