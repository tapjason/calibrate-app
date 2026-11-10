// The words for what shows before a score unlocks (roadmap D53). Pure, so
// tests hold the words to the numbers; the numbers come from the engine.

import { localDate } from '@/components/ui/dates';
import type { CategoryCounts, UnlockEstimate } from '@/types';

/**
 * "You said about 85% on average, and 7 of the 9 scored predictions happened.
 * Too few to read yet." A category's plain counts before its score unlocks:
 * what was said and what happened, with no verdict on the gap (D35).
 * "Scored", because History's summary for the category counts every answer,
 * same-day ones included (record audit, 2026-11-09); "too few to read yet",
 * because counts this small sit inside what luck gives (the Warmup's D36).
 */
export function plainCountsLine(counts: CategoryCounts): string | null {
  if (counts.resolved <= 0) return null;
  const said = Math.round(counts.mean_stated);
  if (counts.resolved === 1) {
    return (
      `Its one scored prediction: you said ${said}%, and ` +
      `${counts.happened === 1 ? 'it happened' : 'it didn’t happen'}. Too few to read yet.`
    );
  }
  return (
    `You said about ${said}% on average, and ${counts.happened} of the ` +
    `${counts.resolved} scored predictions happened. Too few to read yet.`
  );
}

/**
 * "about 9 days", "about 3 weeks", "about 4 months", "more than a year":
 * rounded, since it's an estimate, and no false precision past a year.
 */
export function paceSpan(days: number): string {
  if (days < 14) return `about ${days} ${days === 1 ? 'day' : 'days'}`;
  if (days < 63) return `about ${Math.round(days / 7)} weeks`;
  if (days < 365) return `about ${Math.round(days / 30)} months`;
  return 'more than a year';
}

/**
 * "At your recent pace, about 3 weeks (around Nov 30)." When the rating
 * could unlock (roadmap D53): a tester asked "how many days at my pace?"
 * and found nothing (blind playtest 2026-11-09b, finding 2).
 */
export function unlockEstimateLine(estimate: UnlockEstimate, now: Date): string {
  // No date past a year: it would put back the precision the span leaves out.
  if (estimate.days >= 365) return `At your recent pace, ${paceSpan(estimate.days)}.`;
  const around = localDate(estimate.at, { day: 'numeric', month: 'short' }, now);
  // Month and day held together; a year after the comma may wrap.
  return `At your recent pace, ${paceSpan(estimate.days)} (around ${around.replace(' ', '\u00A0')}).`;
}
