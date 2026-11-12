/**
 * Whole months from `iso` to `now`, in local time, or 0 for null or anything
 * under a month: May 9 to November 1 is 5. Plus's "your N months on file"
 * counts this, from the first answer (TrendSummary.first_resolved_at). It
 * counted the calendar months with an answer in them, so one answer today
 * read as "1 month" and May 9 to November 1 as 7 (blind playtest 2026-11-01).
 */
export function wholeMonthsSince(iso: string | null, now: Date): number {
  if (iso === null) return 0;
  const from = new Date(iso);
  if (Number.isNaN(from.getTime())) return 0;
  let months =
    (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  // Not yet the day of the month it started on: that month isn't whole.
  if (now.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * The months on file in words: "3 months", or "nearly 5 months" once the
 * month under way is more than half done, or null under a whole month. Four
 * months and three weeks read "4 months on file" to a farmer logging since
 * June (blind playtest 2026-11-12e, run 4; 2026-11-12 run 5 too).
 */
export function monthsOnFileWords(iso: string | null, now: Date): string | null {
  const whole = wholeMonthsSince(iso, now);
  if (whole === 0 || iso === null) return null;
  const from = new Date(iso);
  const mark = new Date(from);
  mark.setMonth(from.getMonth() + whole);
  const next = new Date(from);
  next.setMonth(from.getMonth() + whole + 1);
  const pastHalf = now.getTime() - mark.getTime() > (next.getTime() - mark.getTime()) / 2;
  if (pastHalf) return `nearly ${whole + 1} months`;
  return `${whole} ${whole === 1 ? 'month' : 'months'}`;
}
