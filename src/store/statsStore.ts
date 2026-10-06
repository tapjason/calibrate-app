// Stats store. The only place that runs the calibration engine and writes
// derived numbers to the DB. Holds no business math itself — it loads raw
// predictions, hands them to src/engine, and persists the result.

import { create } from 'zustand';

import {
  listPendingPredictions,
  listResolvedPredictions,
} from '@/db/predictions';
import {
  deleteCategoryStat,
  getUserStat,
  listCategoryStats,
  upsertCategoryStat,
  upsertUserStat,
} from '@/db/stats';
import {
  bucketLowFor,
  computeCalibration,
  evaluateBadge,
  isRatingProvisional,
  isScoreProvisional,
  nextBadge,
} from '@/engine/calibration';
import {
  coverageGap as computeCoverageGap,
  evaluateCoverageNudge,
  type CoverageGap,
  type CoverageNudgeDecision,
} from '@/engine/coverageNudge';
import { detectMilestone } from '@/engine/milestones';
import { computeStreak } from '@/engine/streak';
import { buildTrendSummary, type TrendSummary } from '@/engine/trends';
import { buildWrapped, type WrappedSpan, type WrappedSummary } from '@/engine/wrapped';
import type {
  BucketStat,
  CalibrationResult,
  Category,
  CategoryStat,
  Milestone,
  NextBadgeTarget,
  Prediction,
  UserStat,
} from '@/types';

import { useSettingsStore } from './settingsStore';

interface StatsState {
  userStat: UserStat | null;
  categoryStats: CategoryStat[];
  /**
   * Per-category next-badge target keyed by category. Held in memory only and
   * recomputed alongside categoryStats. Lets the badge UI show "what's next"
   * without importing the L3 engine, keeping the L6 → L4 → L3 arrow intact.
   */
  nextBadges: Partial<Record<Category, NextBadgeTarget | null>>;
  /**
   * User-level calibration buckets, recomputed on every load and resolve.
   * Held in memory only — derived from the resolved-predictions list and
   * cheap to rebuild. Screens read this instead of importing the L3 engine
   * directly, keeping the L6 → L4 → L3 dependency arrow intact.
   */
  calibration: CalibrationResult;
  /**
   * The Plus analytics tier's numbers — monthly trend, category drill-down,
   * range coverage. Derived here for the same reason as `calibration`: the
   * engine call belongs in L4 so L6 never imports L3. Computed for everyone
   * regardless of entitlement; the *surface* is what Plus gates, and gating
   * the arithmetic would only mean recomputing it at the moment someone
   * subscribes.
   */
  trends: TrendSummary;
  /**
   * The confidence range this user's recent logs occupy — pending included,
   * because what it measures is the logging habit, not resolved outcomes.
   * Feeds the Log screen's range-coverage nudge via `coverageNudgeNow()`.
   */
  coverageGap: CoverageGap;
  /**
   * The user's bucket that a stated confidence falls in, or null if it has no
   * resolutions yet. Lets Resolve say "6 of 9 in your 60–80% range" without
   * the UI knowing the bucket convention.
   */
  bucketFor: (confidence: number) => BucketStat | null;
  /**
   * Calibration per category, held in memory like `calibration`. Feeds the
   * Log screen's track record ("Your 60–80% calls in finance: 7 of 12
   * happened"), roadmap step 19.
   */
  categoryCalibration: Partial<Record<Category, CalibrationResult>>;
  /** The category's bucket a stated confidence falls in, or null. */
  categoryBucketFor: (category: Category, confidence: number) => BucketStat | null;
  /**
   * The line the last recompute crossed (score unlocked, badge tier-up), or
   * null. Set only by recomputeForUser, never by a load — reopening the app
   * is not an achievement. Whoever celebrates it clears it.
   */
  milestone: Milestone | null;
  clearMilestone: () => void;
  /** Pull persisted stats from the DB into the store and refresh buckets. */
  loadForUser: (userId: string) => Promise<void>;
  /** Re-run the engine over all of a user's predictions and persist. */
  recomputeForUser: (userId: string) => Promise<void>;
}

const EMPTY_CALIBRATION: CalibrationResult = { rating: 0, buckets: [] };

const EMPTY_TRENDS: TrendSummary = buildTrendSummary([]);

const EMPTY_COVERAGE_GAP: CoverageGap = computeCoverageGap([]);

/** Map each category to its next-badge target (engine call lives here, in L4). */
function deriveNextBadges(
  stats: CategoryStat[],
): Partial<Record<Category, NextBadgeTarget | null>> {
  const out: Partial<Record<Category, NextBadgeTarget | null>> = {};
  for (const s of stats) {
    out[s.category] = nextBadge(s.predictions_resolved, s.calibration_score);
  }
  return out;
}

const CATEGORIES: readonly Category[] = [
  'work',
  'health',
  'finance',
  'social',
  'personal',
];

function isYesNo(p: Prediction): boolean {
  return p.status === 'resolved_yes' || p.status === 'resolved_no';
}

/** Per-category calibration for the categories that have any resolutions. */
function deriveCategoryCalibration(
  resolved: readonly Prediction[],
): Partial<Record<Category, CalibrationResult>> {
  const out: Partial<Record<Category, CalibrationResult>> = {};
  for (const category of CATEGORIES) {
    const subset = resolved.filter((p) => p.category === category);
    if (subset.length > 0) out[category] = computeCalibration(subset);
  }
  return out;
}

export const useStatsStore = create<StatsState>((set, get) => ({
  userStat: null,
  categoryStats: [],
  nextBadges: {},
  calibration: EMPTY_CALIBRATION,
  categoryCalibration: {},
  trends: EMPTY_TRENDS,
  coverageGap: EMPTY_COVERAGE_GAP,
  milestone: null,

  clearMilestone: () => set({ milestone: null }),

  bucketFor: (confidence) => {
    const low = bucketLowFor(confidence);
    return get().calibration.buckets.find((b) => b.low === low) ?? null;
  },

  categoryBucketFor: (category, confidence) => {
    const low = bucketLowFor(confidence);
    return get().categoryCalibration[category]?.buckets.find((b) => b.low === low) ?? null;
  },

  loadForUser: async (userId) => {
    // Persisted scalars + an on-demand bucket recompute. The buckets aren't
    // stored (cheap to rebuild, no schema cost), so a fresh load fetches
    // the resolved list too.
    // Pending comes along for the coverage gap only: the nudge counts what the
    // user LOGS, so a prediction made at 20% has to count the day it is made.
    const [userStat, categoryStats, resolved, pending] = await Promise.all([
      getUserStat(userId),
      listCategoryStats(userId),
      listResolvedPredictions(userId),
      listPendingPredictions(userId),
    ]);
    set({
      // The stored streak was computed at the last resolution. Re-derive it
      // against today, so one that ended days ago reads 0 on the next launch
      // rather than waiting for a resolution to notice.
      userStat: userStat
        ? { ...userStat, current_streak: computeStreak(resolved, { now: new Date() }) }
        : null,
      categoryStats,
      nextBadges: deriveNextBadges(categoryStats),
      calibration: computeCalibration(resolved),
      categoryCalibration: deriveCategoryCalibration(resolved),
      trends: buildTrendSummary(resolved),
      coverageGap: computeCoverageGap([...pending, ...resolved]),
    });
  },

  recomputeForUser: async (userId) => {
    // Full recompute: simpler and bug-free vs incremental. N is small.
    const [pending, resolved] = await Promise.all([
      listPendingPredictions(userId),
      listResolvedPredictions(userId),
    ]);
    const all = [...pending, ...resolved];

    // ---- User-level ----
    const userCalc = computeCalibration(resolved);
    const totalResolved = resolved.filter(isYesNo).length;
    const userStat: UserStat = {
      user_id: userId,
      calibration_rating: userCalc.rating,
      total_predictions: all.length,
      total_resolved: totalResolved,
      current_streak: computeStreak(resolved, { now: new Date() }),
      rating_is_provisional: isRatingProvisional(totalResolved),
    };
    await upsertUserStat(userStat);

    // ---- Per-category ----
    // Iterate ALL categories: empty ones get their stale row deleted so the
    // next loadForUser doesn't resurrect a ghost category from disk.
    const categoryStats: CategoryStat[] = [];
    const categoryCalibration: Partial<Record<Category, CalibrationResult>> = {};
    for (const category of CATEGORIES) {
      const subsetAll = all.filter((p) => p.category === category);
      if (subsetAll.length === 0) {
        await deleteCategoryStat(userId, category);
        continue;
      }
      const subsetResolved = resolved.filter((p) => p.category === category);
      const calc = computeCalibration(subsetResolved);
      if (subsetResolved.length > 0) categoryCalibration[category] = calc;
      const resolvedCount = subsetResolved.filter(isYesNo).length;
      const stat: CategoryStat = {
        user_id: userId,
        category,
        predictions_made: subsetAll.length,
        predictions_resolved: resolvedCount,
        calibration_score: calc.rating,
        score_is_provisional: isScoreProvisional(resolvedCount),
        badge_level: evaluateBadge(resolvedCount, calc.rating),
      };
      await upsertCategoryStat(stat);
      categoryStats.push(stat);
    }

    const prev = get();
    const milestone = detectMilestone(
      prev.userStat,
      prev.categoryStats,
      userStat,
      categoryStats,
    );

    set({
      userStat,
      categoryStats,
      nextBadges: deriveNextBadges(categoryStats),
      calibration: userCalc,
      categoryCalibration,
      trends: buildTrendSummary(resolved),
      coverageGap: computeCoverageGap(all),
      // Keep an uncelebrated milestone rather than overwrite it with null.
      milestone: milestone ?? prev.milestone,
    });
  },
}));

/**
 * The lower edge of the confidence range a stated number falls in, by the
 * engine's fixed convention ([0,20) … [80,100]). History filters by range with
 * it (roadmap step 51), so the screen never learns where the edges are.
 */
export function confidenceRangeLow(confidence: number): number {
  return bucketLowFor(confidence);
}

/**
 * Whether the Log screen should nudge for an unlikely prediction right now.
 *
 * The engine call lives here, in L4, so the Log screen never imports L3. Reads
 * the cooldown timestamp from settings rather than subscribing to it: the only
 * writer is the nudge itself, and the screen latches visibility once shown, so
 * a reactive read would just re-hide the panel the instant it appeared.
 */
export function coverageNudgeNow(): CoverageNudgeDecision {
  return evaluateCoverageNudge(
    useStatsStore.getState().coverageGap,
    useSettingsStore.getState().coverageNudgeLastShownAt,
    new Date().toISOString(),
  );
}

/**
 * Calibration Wrapped for one window. Derived on demand rather than held in
 * state (it is a pure function of the resolved list, and caching it would be
 * one more thing to invalidate on every resolution), but called through here
 * so the Share screen never imports the engine (BUILD_PLAN invariant).
 */
export function wrappedSummary(
  resolved: readonly Prediction[],
  span: WrappedSpan,
  now: Date = new Date(),
): WrappedSummary {
  return buildWrapped(resolved, span, now);
}

/**
 * Re-exported so Layer 6 never imports the engine directly. The decision is
 * produced here by `coverageNudgeNow()`; the type travels with it.
 */
export type { CoverageGap, CoverageNudgeDecision, WrappedSpan, WrappedSummary };
