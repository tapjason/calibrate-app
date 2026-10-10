// Over / under / calibrated — the one definition the whole app uses (L3).
//
// Layer rule: imports only from @/types. Kept in its own file so both the
// calibration core (per-bucket labels) and patterns (Coach, Warmup, trends)
// can share it without an import cycle.

import type { Direction } from '@/types';

// A gap this large (5 percentage points) between mean stated confidence and the
// actual outcome rate earns an over/under verdict; anything smaller is "close
// enough" and reads as calibrated. The Warmup no longer uses it: ten answers
// move in steps of 10 points, so it names a lean from the chance range instead
// (warmup.ts, WARMUP_LEAN_MASS). EPSILON guards the boundary
// against float error (e.g. 0.75 − 0.7 = 0.05000000000000004).
const DIRECTION_THRESHOLD = 0.05;
const EPSILON = 1e-9;

/**
 * Classify a stated-confidence-vs-reality gap.
 *
 *   gap = meanStatedConfidence/100 − actualRate
 *   gap > +threshold → overconfident   (felt surer than warranted)
 *   gap < −threshold → underconfident  (right more often than it felt)
 *   otherwise        → calibrated
 *
 * @param meanStatedConfidence mean stated confidence, 0–100
 * @param actualRate           actual outcome / hit rate, 0–1
 */
export function classifyDirection(
  meanStatedConfidence: number,
  actualRate: number,
): Direction {
  const gap = meanStatedConfidence / 100 - actualRate;
  if (gap > DIRECTION_THRESHOLD + EPSILON) return 'overconfident';
  if (gap < -DIRECTION_THRESHOLD - EPSILON) return 'underconfident';
  return 'calibrated';
}
