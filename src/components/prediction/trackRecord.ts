// Presentation helper: the track record under the Log screen's confidence
// control (roadmap step 19). "Your 60–80% calls in finance: 7 of 12 happened."
//
// It closes the feedback loop at the moment of commitment, which is the app's
// premise applied where it matters most. The honesty rules are the chart
// title's (chartTakeaway): nothing until a band has MIN_BUCKET_N_FOR_VERDICT
// resolved, and counts rather than a verdict, so the line can't tell anyone
// what to pick. Free: the Log screen is the core loop, which the paywall never
// touches (CLAUDE.md).

import { MIN_BUCKET_N_FOR_VERDICT, rangeLabel } from '@/components/stats/chartTakeaway';
import type { BucketStat, Category } from '@/types';

export interface TrackRecord {
  text: string;
  /** Which history it reads: this category's, or everything when that's thin. */
  scope: 'category' | 'overall';
}

function happened(b: BucketStat): string {
  const n = b.total_resolved;
  if (b.resolved_yes === n) return `all ${n} happened`;
  if (b.resolved_yes === 0) return `none of ${n} happened`;
  return `${b.resolved_yes} of ${n} happened`;
}

/**
 * The line for a chosen category and confidence, or null when neither the
 * category's band nor the overall band has enough behind it to be worth
 * reading. The category comes first: it's the history that's actually about
 * this kind of call.
 */
export function trackRecordLine(
  category: Category,
  categoryBucket: BucketStat | null,
  overallBucket: BucketStat | null,
): TrackRecord | null {
  if (categoryBucket && categoryBucket.total_resolved >= MIN_BUCKET_N_FOR_VERDICT) {
    return {
      scope: 'category',
      text: `Your ${rangeLabel(categoryBucket)} calls in ${category}: ${happened(categoryBucket)}.`,
    };
  }
  if (overallBucket && overallBucket.total_resolved >= MIN_BUCKET_N_FOR_VERDICT) {
    return {
      scope: 'overall',
      text: `Your ${rangeLabel(overallBucket)} calls: ${happened(overallBucket)}.`,
    };
  }
  return null;
}
