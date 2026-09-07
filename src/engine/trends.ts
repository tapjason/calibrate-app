// Long-range trend derivations (L3). The math behind the Plus analytics tier.
//
// Pure functions over resolved predictions — no I/O, no state, no store. Same
// rule as the rest of the engine: plain objects in, plain objects out, and the
// screens read the result through a store rather than importing this.
//
// Everything here obeys the project's cardinal statistical rule (CLAUDE.md):
// never present a number built on noise. Each period and each category carries
// its own `resolved` count and a `provisional` flag, so the UI can show the
// shape of a trend without asserting a score that three resolutions produced.

import { computeCalibrationPoints, type CalibrationPoint } from './calibration';
import { classifyDirection } from './patterns';
import {
  MIN_N_CATEGORY,
  type Category,
  type Direction,
  type Prediction,
} from '@/types';

/**
 * Below this, a period's score is shape, not a number to headline. Lower than
 * MIN_N_OVERALL (20) on purpose: a month is a small window by construction,
 * and requiring 20 resolutions per month would leave every period provisional
 * for all but the heaviest users. The flag is what keeps it honest.
 */
export const MIN_N_PERIOD = 8;

/** One month of resolved predictions. */
export interface PeriodStat {
  /** 'YYYY-MM' in UTC — same untrusted-clock stance as the streak engine. */
  period: string;
  resolved: number;
  /** Calibration score for the period, 0–100. Meaningless if provisional. */
  score: number;
  mean_confidence: number;
  hit_rate: number;
  direction: Direction;
  /** True while `resolved` < MIN_N_PERIOD — do not headline the score. */
  provisional: boolean;
}

/** A category's standing, plus how it is moving. */
export interface CategoryTrend {
  category: Category;
  resolved: number;
  score: number;
  mean_confidence: number;
  hit_rate: number;
  direction: Direction;
  provisional: boolean;
}

/** How much of the 0–100 confidence range the user actually uses. */
export interface CoverageStat {
  /** Buckets with at least one resolution, out of five. */
  buckets_used: number;
  /** buckets_used / 5, 0–1. */
  coverage: number;
  /** Bucket lower bounds with no resolutions at all, ascending. */
  empty_buckets: number[];
  /**
   * Share of resolutions in the 35–65 "honest uncertainty" band, 0–1. The
   * integrity bonus exists to pull people here; this is whether it works.
   */
  middle_share: number;
}

/** Everything the Plus analytics surface renders. */
export interface TrendSummary {
  /** Most recent last. Only months with at least one resolution appear. */
  periods: PeriodStat[];
  /** Sorted worst score first — the drill-down starts where the problem is. */
  categories: CategoryTrend[];
  coverage: CoverageStat;
  /** Change in score between the older and newer half of all history. */
  delta_recent: number | null;
}

const BUCKET_WIDTH = 20;
const BUCKET_COUNT = 5;
const MIDDLE_LOW = 35;
const MIDDLE_HIGH = 65;

function isYesNo(p: Prediction): boolean {
  return p.status === 'resolved_yes' || p.status === 'resolved_no';
}

function toPoint(p: Prediction): CalibrationPoint {
  return { confidence: p.confidence, yes: p.status === 'resolved_yes' };
}

/** Resolved yes/no predictions with a usable timestamp, oldest first. */
function timeline(resolved: readonly Prediction[]): Prediction[] {
  return resolved
    .filter((p) => isYesNo(p) && p.resolved_at !== null)
    .sort((a, b) => (a.resolved_at! < b.resolved_at! ? -1 : 1));
}

/** 'YYYY-MM' of an ISO timestamp, in UTC. */
function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function summarize(points: CalibrationPoint[]): {
  score: number;
  mean_confidence: number;
  hit_rate: number;
  direction: Direction;
} {
  const { rating } = computeCalibrationPoints(points);
  const meanConfidence =
    points.reduce((sum, pt) => sum + pt.confidence, 0) / points.length;
  const hitRate = points.filter((pt) => pt.yes).length / points.length;
  return {
    score: rating,
    mean_confidence: meanConfidence,
    hit_rate: hitRate,
    direction: classifyDirection(meanConfidence, hitRate),
  };
}

/**
 * Calibration month by month, oldest first.
 *
 * Months with no resolutions are omitted rather than zero-filled: a gap in the
 * data is not a month of score 0, and plotting it as one would draw a cliff
 * where nothing happened.
 */
export function monthlyTrend(resolved: readonly Prediction[]): PeriodStat[] {
  const byMonth = new Map<string, CalibrationPoint[]>();
  for (const p of timeline(resolved)) {
    const key = monthKey(p.resolved_at!);
    const list = byMonth.get(key) ?? [];
    list.push(toPoint(p));
    byMonth.set(key, list);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([period, points]) => ({
      period,
      resolved: points.length,
      ...summarize(points),
      provisional: points.length < MIN_N_PERIOD,
    }));
}

/**
 * Per-category standing, worst score first.
 *
 * Provisional categories sort last regardless of score — "your worst domain"
 * should not be a category with four resolutions, which is the exact mistake
 * the min-N rule exists to prevent.
 */
export function categoryTrends(resolved: readonly Prediction[]): CategoryTrend[] {
  const byCategory = new Map<Category, CalibrationPoint[]>();
  for (const p of resolved.filter(isYesNo)) {
    const list = byCategory.get(p.category) ?? [];
    list.push(toPoint(p));
    byCategory.set(p.category, list);
  }

  const trends: CategoryTrend[] = [...byCategory.entries()].map(
    ([category, points]) => ({
      category,
      resolved: points.length,
      ...summarize(points),
      provisional: points.length < MIN_N_CATEGORY,
    }),
  );

  return trends.sort((a, b) => {
    if (a.provisional !== b.provisional) return a.provisional ? 1 : -1;
    return a.score - b.score;
  });
}

/**
 * How much of the confidence range the user actually uses.
 *
 * CLAUDE.md's range-coverage caveat: most people cluster in 60–90% and rarely
 * log things they expect not to happen, so half the curve is never measured. A
 * calibration score built on one bucket is a score about one bucket.
 */
export function confidenceCoverage(resolved: readonly Prediction[]): CoverageStat {
  const yesNo = resolved.filter(isYesNo);
  const used = new Set<number>();
  let middle = 0;

  for (const p of yesNo) {
    const index = Math.min(
      BUCKET_COUNT - 1,
      Math.floor(p.confidence / BUCKET_WIDTH),
    );
    used.add(index);
    if (p.confidence >= MIDDLE_LOW && p.confidence <= MIDDLE_HIGH) middle += 1;
  }

  const empty: number[] = [];
  for (let i = 0; i < BUCKET_COUNT; i++) {
    if (!used.has(i)) empty.push(i * BUCKET_WIDTH);
  }

  return {
    buckets_used: used.size,
    coverage: used.size / BUCKET_COUNT,
    empty_buckets: empty,
    middle_share: yesNo.length === 0 ? 0 : middle / yesNo.length,
  };
}

/**
 * Score over the newer half of history minus the older half. Positive means
 * improving. Null below `minResolved` — the same shape as categoryDrift in
 * patterns.ts, applied to everything rather than one category.
 */
export function overallDelta(
  resolved: readonly Prediction[],
  minResolved = 8,
): number | null {
  const ordered = timeline(resolved);
  if (ordered.length < minResolved) return null;

  const mid = Math.floor(ordered.length / 2);
  const earlier = computeCalibrationPoints(ordered.slice(0, mid).map(toPoint));
  const recent = computeCalibrationPoints(ordered.slice(mid).map(toPoint));
  return recent.rating - earlier.rating;
}

/** Everything the Plus analytics surface needs, in one pass-friendly call. */
export function buildTrendSummary(resolved: readonly Prediction[]): TrendSummary {
  return {
    periods: monthlyTrend(resolved),
    categories: categoryTrends(resolved),
    coverage: confidenceCoverage(resolved),
    delta_recent: overallDelta(resolved),
  };
}
