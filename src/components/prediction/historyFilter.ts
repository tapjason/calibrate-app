// History's filters, kept out of the screen so they can be tested as plain
// functions. Pure presentation: which range a confidence falls in is the
// engine's convention, handed in as `rangeLow` (via statsStore) so this file
// never learns where the edges are.

import type { Category, Prediction } from '@/types';

/** The lower edges of the five confidence ranges, as they arrive in a link. */
const RANGE_LOWS: readonly number[] = [0, 20, 40, 60, 80];

/**
 * The `?range=` a Stats coverage cell opens History with (roadmap step 51),
 * or null for a missing or unknown one, so a stale or hand-typed link shows
 * everything rather than an empty list.
 */
export function parseRangeParam(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const low = Number(value);
  return RANGE_LOWS.includes(low) ? low : null;
}

/** "80–100%", as the chart, the coverage row and Resolve write a range. */
export function rangeText(low: number): string {
  return `${low}–${low + 20}%`;
}

export interface HistoryFilter {
  category: Category | 'all';
  /** Lower edge of a confidence range, or null for every range. */
  range: number | null;
}

export function filterHistory(
  resolved: readonly Prediction[],
  { category, range }: HistoryFilter,
  rangeLow: (confidence: number) => number,
): Prediction[] {
  return resolved.filter(
    (p) =>
      (category === 'all' || p.category === category) &&
      (range === null || rangeLow(p.confidence) === range),
  );
}

/** One sentence for an empty filtered list: what's missing, in plain words. */
export function emptyHistoryMessage({ category, range }: HistoryFilter): string {
  if (category === 'all' && range === null) {
    return 'Resolved predictions collect here, with how each one turned out.';
  }
  const where = [
    category === 'all' ? null : `in ${category}`,
    range === null ? null : `at ${rangeText(range)}`,
  ]
    .filter(Boolean)
    .join(' ');
  return `Nothing resolved ${where} yet.`;
}
