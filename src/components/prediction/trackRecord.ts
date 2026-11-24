// Presentation helper: the track record under the Log screen's confidence
// control (roadmap step 19). "12 scored finance calls at 60–80% so far. 7
// happened."
//
// It closes the feedback loop at the moment of commitment, which is the app's
// premise applied where it matters most, and it was the one line that moved
// blind testers' numbers (playtest 2026-11-10). Counts rather than a verdict,
// so the line can't tell anyone what to pick. From MIN_N_BAND scored answers
// in a range it reads plainly; from TRACK_RECORD_MIN_N, for every category
// together, it says it's too few to read (roadmap D57). Scored answers only,
// the chart's own buckets. Free: the Log screen is the core loop, which the
// paywall never touches (CLAUDE.md).

import { MIN_BUCKET_N_FOR_VERDICT, rangeLabel } from '@/components/stats/chartTakeaway';
import { TRACK_RECORD_MIN_N } from '@/constants/app';
import type { BucketStat, Category } from '@/types';
import { categoryLabel } from '@/store/categoryStore';

export interface TrackRecord {
  text: string;
  /** Which history it reads: this category's, or everything when that's thin. */
  scope: 'category' | 'overall';
}

function happened(b: BucketStat): string {
  const n = b.total_resolved;
  if (b.resolved_yes === n) return `All ${n} happened.`;
  if (b.resolved_yes === 0) return 'None happened.';
  return `${b.resolved_yes} happened.`;
}

/**
 * "12 scored finance calls at 60–80% so far. 7 happened." (D76, the voice
 * pass, 2026-11-23; it was "Of your 12 scored finance calls at 60–80%, 7
 * happened.").
 */
function line(b: BucketStat, category: Category | null): string {
  const calls = category === null ? 'calls' : `${categoryLabel(category)} calls`;
  return `${b.total_resolved} scored ${calls} at ${rangeLabel(b)} so far. ${happened(b)}`;
}

/**
 * The line for a chosen category and confidence, or null when not even every
 * category together has TRACK_RECORD_MIN_N behind it. The category comes
 * first: it's the history that's actually about this kind of call. Below
 * MIN_N_BAND it reads every category, the larger sample, and says so.
 */
export function trackRecordLine(
  /** Null while none is chosen (roadmap D29): then it reads every category. */
  category: Category | null,
  categoryBucket: BucketStat | null,
  overallBucket: BucketStat | null,
): TrackRecord | null {
  if (
    category !== null &&
    categoryBucket &&
    categoryBucket.total_resolved >= MIN_BUCKET_N_FOR_VERDICT
  ) {
    return { scope: 'category', text: line(categoryBucket, category) };
  }
  if (overallBucket && overallBucket.total_resolved >= MIN_BUCKET_N_FOR_VERDICT) {
    return { scope: 'overall', text: line(overallBucket, null) };
  }
  if (overallBucket && overallBucket.total_resolved >= TRACK_RECORD_MIN_N) {
    // "Early days." (D76): it was "Too few to read yet."
    return { scope: 'overall', text: `${line(overallBucket, null)} Early days.` };
  }
  return null;
}
