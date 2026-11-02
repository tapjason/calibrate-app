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
