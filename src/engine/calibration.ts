// The calibration engine. Pure functions only — no I/O, no storage, no
// component state. Takes plain Prediction objects in, returns plain numbers
// and objects out. That purity is what makes this the highest-value test
// target in the project: every behavior can be pinned with a unit test.
//
// Layer rule: this file may only import from @/types. Never reach into
// src/db/, src/store/, or anywhere else.

import {
  MIN_N_CATEGORY,
  MIN_N_OVERALL,
  type BadgeLevel,
  type BucketStat,
  type CalibrationResult,
  type ComputeCalibration,
  type EvaluateBadge,
  type NextBadge,
  type NextBadgeTarget,
  type Prediction,
} from '@/types';

// 5 buckets of 20% each: [0,20) [20,40) [40,60) [60,80) [80,100]
// The last bucket is inclusive on both ends so confidence=100 has a home.
const BUCKET_COUNT = 5;
const BUCKET_WIDTH = 20;

function bucketIndex(confidence: number): number {
  if (confidence >= 100) return BUCKET_COUNT - 1;
  return Math.floor(confidence / BUCKET_WIDTH);
}

/** Predictions that count toward calibration: yes/no outcomes only. */
function isCalibratable(p: Prediction): boolean {
  return p.status === 'resolved_yes' || p.status === 'resolved_no';
}

/**
 * A single calibratable outcome: a stated confidence and whether it came true.
 * The lowest-level unit the bucketing works on — both real predictions and
 * Warmup quiz answers reduce to this, so they score through one code path.
 */
export interface CalibrationPoint {
  confidence: number; // 0–100 stated confidence
  yes: boolean;       // did the outcome happen / was the answer correct
}

/**
 * The shared bucketing core. Bucket outcomes by stated confidence, compute
 * per-bucket accuracy, and average the mean-absolute error into a 0–100 score.
 *
 *   actual_rate  = yes / total_in_bucket
 *   bucket_error = | stated_confidence_mean/100 − actual_rate |
 *   rating       = 100 − (mean bucket_error) × 100
 *
 * Absolute (not squared) error per CLAUDE.md: it drops the score ~1 point per
 * average percentage point of miscalibration, which is discriminating and
 * directly interpretable, where squared error compresses everyone non-extreme
 * into 84–100.
 *
 * Empty input returns rating=0 (not 100) so callers can distinguish "no
 * data" from "perfectly calibrated" by checking buckets.length.
 */
export function computeCalibrationPoints(
  points: readonly CalibrationPoint[],
): CalibrationResult {
  // Accumulate only into buckets that have data — preserves "non-empty
  // buckets only" without allocating five empty bucket structs.
  type Acc = { total: number; yes: number; confidenceSum: number };
  const sums = new Map<number, Acc>();

  for (const pt of points) {
    const i = bucketIndex(pt.confidence);
    const a = sums.get(i) ?? { total: 0, yes: 0, confidenceSum: 0 };
    a.total += 1;
    a.confidenceSum += pt.confidence;
    if (pt.yes) a.yes += 1;
    sums.set(i, a);
  }

  const buckets: BucketStat[] = [];
  let errorTotal = 0;

  // Sort by bucket index so output is ascending in `low`.
  const ordered = [...sums.entries()].sort(([a], [b]) => a - b);
  for (const [i, a] of ordered) {
    const statedMean = a.confidenceSum / a.total;
    const actualRate = a.yes / a.total;
    const error = Math.abs(statedMean / 100 - actualRate);
    errorTotal += error;
    buckets.push({
      low: i * BUCKET_WIDTH,
      high: (i + 1) * BUCKET_WIDTH, // semantic: top bucket is [80,100], others [low, high)
      total_resolved: a.total,
      resolved_yes: a.yes,
      stated_confidence_mean: statedMean,
      actual_rate: actualRate,
      bucket_error: error,
    });
  }

  const rawRating =
    buckets.length === 0 ? 0 : 100 - (errorTotal / buckets.length) * 100;
  // Clamp to [0,100]. With absolute error each bucket_error ∈ [0,1] so the mean
  // is ≤ 1 and rating ≥ 0 already — the clamp is a cheap guard against float
  // drift, matching the "Score is clamped to [0, 100]" line in CLAUDE.md.
  const rating = Math.max(0, Math.min(100, rawRating));

  return { rating, buckets };
}

/**
 * Score a set of resolved predictions. Thin adapter over
 * computeCalibrationPoints: keep only yes/no outcomes and reduce each to a
 * {confidence, yes} point.
 */
export const computeCalibration: ComputeCalibration = (resolved) =>
  computeCalibrationPoints(
    resolved
      .filter(isCalibratable)
      .map((p) => ({ confidence: p.confidence, yes: p.status === 'resolved_yes' })),
  );

/**
 * Overall rating is provisional (must not be shown as a headline number) until
 * the user has at least MIN_N_OVERALL resolved predictions. Below that, a
 * bucket's actual_rate is too coarse to trust.
 */
export const isRatingProvisional = (totalResolved: number): boolean =>
  totalResolved < MIN_N_OVERALL;

/**
 * A category score is provisional until MIN_N_CATEGORY resolved predictions in
 * that category. While provisional, no badge above `tracker` may be awarded —
 * which the resolution gates in evaluateBadge already enforce, since every
 * badge above tracker requires ≥20 ≥ MIN_N_CATEGORY resolved.
 */
export const isScoreProvisional = (resolvedCount: number): boolean =>
  resolvedCount < MIN_N_CATEGORY;

/**
 * Choose the highest badge the user qualifies for per CLAUDE.md. Every badge
 * above tracker requires BOTH a score threshold AND a resolution minimum — a
 * badge earned on a handful of lucky calls misleads the user about themselves,
 * which is the opposite of the app's purpose:
 *
 *   Oracle      score > 90 AND predictionsResolved ≥ 100
 *   Sharp       score > 85 AND predictionsResolved ≥ 50
 *   Forecaster  score > 70 AND predictionsResolved ≥ 20
 *   Tracker                     predictionsResolved ≥ 20
 *   Guesser     default floor
 *
 * The resolution gates also enforce "no badge above tracker while provisional":
 * every gate above tracker is ≥ 20 > MIN_N_CATEGORY, so a provisional category
 * (< 15 resolved) can only ever be a guesser.
 */
export const evaluateBadge: EvaluateBadge = (
  predictionsResolved,
  calibrationScore,
) => {
  if (predictionsResolved >= 100 && calibrationScore > 90) return 'oracle';
  if (predictionsResolved >= 50 && calibrationScore > 85) return 'sharp';
  if (predictionsResolved >= 20 && calibrationScore > 70) return 'forecaster';
  if (predictionsResolved >= 20) return 'tracker';
  return 'guesser' satisfies BadgeLevel;
};

// Badges from lowest to highest, with the absolute thresholds each one gates
// on. Mirrors evaluateBadge — keep the two in sync.
const BADGE_LADDER: BadgeLevel[] = [
  'guesser',
  'tracker',
  'forecaster',
  'sharp',
  'oracle',
];

const BADGE_REQUIREMENTS: Record<BadgeLevel, NextBadgeTarget> = {
  guesser: { badge: 'guesser', needResolved: null, needScore: null },
  tracker: { badge: 'tracker', needResolved: 20, needScore: null },
  forecaster: { badge: 'forecaster', needResolved: 20, needScore: 70 },
  sharp: { badge: 'sharp', needResolved: 50, needScore: 85 },
  oracle: { badge: 'oracle', needResolved: 100, needScore: 90 },
};

/**
 * The badge one rank above the user's current one, with its thresholds, so the
 * UI can show "what's next". Returns null when the user is already an oracle.
 * The "next" badge is purely positional on the ladder — a forecaster's next is
 * always sharp even if they skipped tracker's resolution count, matching
 * evaluateBadge's highest-qualifying rule.
 */
export const nextBadge: NextBadge = (predictionsResolved, calibrationScore) => {
  const current = evaluateBadge(predictionsResolved, calibrationScore);
  const idx = BADGE_LADDER.indexOf(current);
  if (idx >= BADGE_LADDER.length - 1) return null;
  return BADGE_REQUIREMENTS[BADGE_LADDER[idx + 1]];
};
