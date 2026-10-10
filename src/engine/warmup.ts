// Warmup scorer. The Day-0 aha: a short estimation quiz scored by the SAME
// calibration engine as real predictions, so the mechanic the user learns here
// is exactly the one the app runs on.
//
// Layer rule: L3 engine — imports only from @/types and sibling engine files.
// Warmup results are returned as a plain object; persisting them (separately
// from real UserStat/CategoryStat) is the caller's job.

import type { WarmupAnswer, WarmupResult } from '@/types';

import { computeCalibrationPoints } from './calibration';
import { chanceRange } from './chance';

/**
 * The share of chance outcomes a Warmup result may land in and still be called
 * luck: the central 80%. Ten answers move accuracy in steps of 10 points, so
 * the ±5 rule used elsewhere called a lean on 47–73% of perfectly calibrated
 * people (research/day0-2026-10.md §2). A sentence reads as a conclusion, so
 * its bar sits higher than the chart's grey bars (the central half).
 */
export const WARMUP_LEAN_MASS = 0.8;

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
 * mini-score and chart. The direction names a lean only when accuracy falls
 * outside the central WARMUP_LEAN_MASS of what a perfectly calibrated person
 * at the mean stated confidence would get from this many answers; inside it,
 * `calibrated` means "no clear lean" (roadmap D18 (2)). The binomial at the
 * mean is wider than the exact spread of mixed confidences, so it errs toward
 * calling luck.
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
    direction: leanFor(answers.length, meanConfidence, accuracy),
    buckets,
  };
}

function leanFor(
  n: number,
  meanConfidence: number,
  accuracy: number,
): WarmupResult['direction'] {
  const { low, high } = chanceRange(n, meanConfidence / 100, WARMUP_LEAN_MASS);
  if (accuracy < low - 1e-9) return 'overconfident';
  if (accuracy > high + 1e-9) return 'underconfident';
  return 'calibrated';
}
