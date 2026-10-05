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
import { localParts } from './localTime';
import { classifyDirection } from './patterns';
import {
  MIN_N_BAND,
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
  /** 'YYYY-MM', the device's local month — a resolution at 20:00 on Jan 31 is January's. */
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

/**
 * One row of the personal correction table: what a confidence band has meant,
 * in one category. "In finance, your 80–100% came true 47% of the time."
 */
export interface CorrectionRow {
  category: Category;
  low: number;
  high: number;
  /** Mean stated confidence in the band, 0–100. */
  stated_mean: number;
  /** How often it happened, 0–1. */
  actual_rate: number;
  resolved: number;
  happened: number;
  /** |stated_mean/100 − actual_rate|, the engine's bucket error. */
  error: number;
  direction: Direction;
}

/** The band nearest to earning a row, for an honest empty state. */
export interface CorrectionProgress {
  category: Category;
  low: number;
  high: number;
  resolved: number;
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
  /** The correction table, worst band first (roadmap step 20). */
  corrections: CorrectionRow[];
  /** When `corrections` is empty: the band closest to qualifying, or null. */
  correction_progress: CorrectionProgress | null;
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

/** 'YYYY-MM' of an ISO timestamp, in the device's local time. */
function monthKey(iso: string): string {
  const { year, month } = localParts(new Date(iso));
  return `${year}-${String(month + 1).padStart(2, '0')}`;
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

/**
 * The personal correction table: per category and confidence band, how often
 * the user's stated confidence actually came true. The most actionable thing
 * the numbers say ("read your 80% in money as 50%"), and it needs no model.
 *
 * Only bands with at least `minN` resolved appear, so it can never print 0% or
 * 100% off two predictions. Worst calibrated first, at most `limit` rows.
 */
export function correctionTable(
  resolved: readonly Prediction[],
  minN = MIN_N_BAND,
  limit = 5,
): { rows: CorrectionRow[]; progress: CorrectionProgress | null } {
  const byCategory = new Map<Category, CalibrationPoint[]>();
  for (const p of resolved.filter(isYesNo)) {
    const list = byCategory.get(p.category) ?? [];
    list.push(toPoint(p));
    byCategory.set(p.category, list);
  }

  const rows: CorrectionRow[] = [];
  let progress: CorrectionProgress | null = null;
  for (const [category, points] of byCategory) {
    for (const b of computeCalibrationPoints(points).buckets) {
      if (b.total_resolved >= minN) {
        rows.push({
          category,
          low: b.low,
          high: b.high,
          stated_mean: b.stated_confidence_mean,
          actual_rate: b.actual_rate,
          resolved: b.total_resolved,
          happened: b.resolved_yes,
          error: b.bucket_error,
          direction: b.direction,
        });
      } else if (!progress || b.total_resolved > progress.resolved) {
        progress = { category, low: b.low, high: b.high, resolved: b.total_resolved };
      }
    }
  }

  rows.sort((a, b) => b.error - a.error || b.resolved - a.resolved);
  return { rows: rows.slice(0, limit), progress: rows.length > 0 ? null : progress };
}

/** Everything the Plus analytics surface needs, in one pass-friendly call. */
export function buildTrendSummary(resolved: readonly Prediction[]): TrendSummary {
  const corrections = correctionTable(resolved);
  return {
    periods: monthlyTrend(resolved),
    categories: categoryTrends(resolved),
    coverage: confidenceCoverage(resolved),
    delta_recent: overallDelta(resolved),
    corrections: corrections.rows,
    correction_progress: corrections.progress,
  };
}
