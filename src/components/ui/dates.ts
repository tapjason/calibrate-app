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
  return date.toLocaleDateString(undefined, withYear);
}
