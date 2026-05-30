// The calibration engine. Pure functions only — no I/O, no storage, no
// component state. Takes plain Prediction objects in, returns plain numbers
// and objects out. That purity is what makes this the highest-value test
// target in the project: every behavior can be pinned with a unit test.
//
// Layer rule: this file may only import from @/types. Never reach into
// src/db/, src/store/, or anywhere else.

import type {
  BadgeLevel,
  BucketStat,
  CalibrationResult,
  ComputeCalibration,
  EvaluateBadge,
  NextBadge,
  NextBadgeTarget,
  Prediction,
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
 * Bucket calibratable predictions by stated confidence, compute per-bucket
 * accuracy, and average the squared error into a 0–100 rolling score.
 *
 *   actual_rate  = resolved_yes / total_resolved_in_bucket
 *   bucket_error = (stated_confidence_mean/100 − actual_rate)²
 *   rating       = 100 − (mean bucket_error) × 100
 *
 * Empty input returns rating=0 (not 100) so callers can distinguish "no
 * data" from "perfectly calibrated" by checking buckets.length.
 */
export const computeCalibration: ComputeCalibration = (resolved) => {
  // Accumulate only into buckets that have data — preserves "non-empty
  // buckets only" without allocating five empty bucket structs.
  type Acc = { total: number; yes: number; confidenceSum: number };
  const sums = new Map<number, Acc>();

  for (const p of resolved) {
    if (!isCalibratable(p)) continue;
    const i = bucketIndex(p.confidence);
    const a = sums.get(i) ?? { total: 0, yes: 0, confidenceSum: 0 };
    a.total += 1;
    a.confidenceSum += p.confidence;
    if (p.status === 'resolved_yes') a.yes += 1;
    sums.set(i, a);
  }

  const buckets: BucketStat[] = [];
  let errorTotal = 0;

  // Sort by bucket index so output is ascending in `low`.
  const ordered = [...sums.entries()].sort(([a], [b]) => a - b);
  for (const [i, a] of ordered) {
    const statedMean = a.confidenceSum / a.total;
    const actualRate = a.yes / a.total;
    const error = (statedMean / 100 - actualRate) ** 2;
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

  const rating =
    buckets.length === 0 ? 0 : 100 - (errorTotal / buckets.length) * 100;

  return { rating, buckets };
};

/**
 * Choose the highest badge the user qualifies for per CLAUDE.md:
 *
 *   Oracle      score > 90 AND predictionsResolved ≥ 100
 *   Sharp       score > 85
 *   Forecaster  score > 70
 *   Tracker                       predictionsResolved ≥ 20
 *   Guesser     default floor
 */
export const evaluateBadge: EvaluateBadge = (
  predictionsResolved,
  calibrationScore,
) => {
  if (predictionsResolved >= 100 && calibrationScore > 90) return 'oracle';
  if (calibrationScore > 85) return 'sharp';
  if (calibrationScore > 70) return 'forecaster';
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
  forecaster: { badge: 'forecaster', needResolved: null, needScore: 70 },
  sharp: { badge: 'sharp', needResolved: null, needScore: 85 },
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
