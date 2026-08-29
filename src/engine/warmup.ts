// Warmup scorer. The Day-0 aha: a short estimation quiz scored by the SAME
// calibration engine as real predictions, so the mechanic the user learns here
// is exactly the one the app runs on.
//
// Layer rule: L3 engine — imports only from @/types and sibling engine files.
// Warmup results are returned as a plain object; persisting them (separately
// from real UserStat/CategoryStat) is the caller's job.

import type { WarmupAnswer, WarmupResult } from '@/types';

import { computeCalibrationPoints } from './calibration';
import { classifyDirection } from './patterns';

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
 * mini-score and chart, and derives the headline verdict with the shared
 * classifyDirection (overall stated confidence vs. actual accuracy), so
 * "overconfident" means exactly what it does everywhere else.
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

  return {
    answered: answers.length,
    mean_confidence: meanConfidence,
    accuracy,
    mini_score: rating,
    direction: classifyDirection(meanConfidence, accuracy),
    buckets,
  };
}
