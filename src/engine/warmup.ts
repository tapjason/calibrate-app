// Warmup scorer. The Day-0 aha: a short estimation quiz scored by the SAME
// calibration engine as real predictions, so the mechanic the user learns here
// is exactly the one the app runs on.
//
// Layer rule: L3 engine — imports only from @/types and sibling engine files.
// Warmup results are returned as a plain object; persisting them (separately
// from real UserStat/CategoryStat) is the caller's job.

import type { WarmupAnswer, WarmupResult } from '@/types';

import { computeCalibrationPoints } from './calibration';

// How far overall stated confidence must sit from actual accuracy before we
// call the user over/under-confident rather than calibrated. 5 percentage
// points — enough to avoid labelling normal noise as a verdict.
const DIRECTION_THRESHOLD = 0.05;

// Guards the threshold comparison against float error: `0.75 − 0.7` is
// `0.05000000000000004`, so a gap sitting exactly on the threshold must not tip
// into a verdict. A gap must clear the threshold by more than this to count.
const EPSILON = 1e-9;

const EMPTY: WarmupResult = {
  answered: 0,
  mean_confidence: 0,
  accuracy: 0,
  mini_score: 0,
  direction: 'calibrated',
  buckets: [],
};

/**
 * Score a completed Warmup quiz. Reuses the bucketed MAE engine for the
 * mini-score and chart, and derives the headline verdict from overall stated
 * confidence vs. actual accuracy:
 *
 *   gap = mean_confidence/100 − accuracy
 *   gap >  +threshold → overconfident   (felt surer than they were)
 *   gap <  −threshold → underconfident  (right more often than they felt)
 *   otherwise         → calibrated
 *
 * Empty input returns a zeroed, `calibrated` result rather than throwing.
 */
export function scoreWarmup(answers: readonly WarmupAnswer[]): WarmupResult {
  if (answers.length === 0) return EMPTY;

  const { rating, buckets } = computeCalibrationPoints(
    answers.map((a) => ({ confidence: a.confidence, yes: a.correct })),
  );

  const confidenceSum = answers.reduce((s, a) => s + a.confidence, 0);
  const correctCount = answers.reduce((s, a) => s + (a.correct ? 1 : 0), 0);
  const meanConfidence = confidenceSum / answers.length;
  const accuracy = correctCount / answers.length;

  const gap = meanConfidence / 100 - accuracy;
  const direction: WarmupResult['direction'] =
    gap > DIRECTION_THRESHOLD + EPSILON
      ? 'overconfident'
      : gap < -DIRECTION_THRESHOLD - EPSILON
        ? 'underconfident'
        : 'calibrated';

  return {
    answered: answers.length,
    mean_confidence: meanConfidence,
    accuracy,
    mini_score: rating,
    direction,
    buckets,
  };
}
