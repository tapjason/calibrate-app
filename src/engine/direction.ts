// Over / under / calibrated — the one definition the whole app uses (L3).
//
// Layer rule: imports only from @/types and sibling engine files. Kept in its
// own file so the calibration core (per-bucket labels) and patterns (Coach,
// Warmup, trends, Wrapped, practice) share it without an import cycle.

import type { Direction } from '@/types';

import { chanceRange } from './chance';

/**
 * One rule for a lean everywhere (roadmap D35, decided 2026-11-01): the share
 * that happened must fall outside the central 80% of what luck gives a
 * perfectly calibrated person at that count. Until then the chart and the
 * month summaries called a lean at any gap of 5 points while the warm-up used
 * this band, so a dot could be "overconfident" on the same evidence the
 * warm-up called luck (blind playtest 2026-11-01, run 6). The chart's grey
 * bars draw this same 80% (CHANCE_MASS).
 */
export const LEAN_MASS = 0.8;

// And by at least 5 percentage points: with hundreds of answers the band
// narrows below a gap anyone would act on. EPSILON guards the boundary
// against float error (e.g. 0.75 − 0.7 = 0.05000000000000004).
const MIN_GAP = 0.05;
const EPSILON = 1e-9;

/**
 * Classify a stated-confidence-vs-reality gap over n answers.
 *
 *   overconfident   happened less often than luck allows at that confidence
 *   underconfident  happened more often than luck allows
 *   calibrated      inside the band, or within 5 points either way
 *
 * @param meanStatedConfidence mean stated confidence, 0–100
 * @param actualRate           share that happened, 0–1
 * @param n                    answers behind the rate
 */
export function classifyDirection(
  meanStatedConfidence: number,
  actualRate: number,
  n: number,
): Direction {
  const gap = meanStatedConfidence / 100 - actualRate;
  if (n <= 0 || Math.abs(gap) <= MIN_GAP + EPSILON) return 'calibrated';
  const { low, high } = chanceRange(n, meanStatedConfidence / 100, LEAN_MASS);
  if (actualRate < low - EPSILON) return 'overconfident';
  if (actualRate > high + EPSILON) return 'underconfident';
  return 'calibrated';
}
