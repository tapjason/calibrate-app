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
import { computeCalibration, evaluateBadge } from '@/engine/calibration';
import { computeStreak } from '@/engine/streak';
import type {
  CalibrationResult,
  Category,
  CategoryStat,
  Prediction,
  UserStat,
} from '@/types';

interface StatsState {
  userStat: UserStat | null;
  categoryStats: CategoryStat[];
  /**
   * User-level calibration buckets, recomputed on every load and resolve.
   * Held in memory only — derived from the resolved-predictions list and
   * cheap to rebuild. Screens read this instead of importing the L3 engine
   * directly, keeping the L6 → L4 → L3 dependency arrow intact.
   */
  calibration: CalibrationResult;
  /** Pull persisted stats from the DB into the store and refresh buckets. */
  loadForUser: (userId: string) => Promise<void>;
  /** Re-run the engine over all of a user's predictions and persist. */
  recomputeForUser: (userId: string) => Promise<void>;
}

const EMPTY_CALIBRATION: CalibrationResult = { rating: 0, buckets: [] };

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

export const useStatsStore = create<StatsState>((set) => ({
  userStat: null,
  categoryStats: [],
  calibration: EMPTY_CALIBRATION,

  loadForUser: async (userId) => {
    // Persisted scalars + an on-demand bucket recompute. The buckets aren't
    // stored (cheap to rebuild, no schema cost), so a fresh load fetches
    // the resolved list too.
    const [userStat, categoryStats, resolved] = await Promise.all([
      getUserStat(userId),
      listCategoryStats(userId),
      listResolvedPredictions(userId),
    ]);
    set({
      userStat,
      categoryStats,
      calibration: computeCalibration(resolved),
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
    const userStat: UserStat = {
      user_id: userId,
      calibration_rating: userCalc.rating,
      total_predictions: all.length,
      total_resolved: resolved.filter(isYesNo).length,
      current_streak: computeStreak(resolved),
    };
    await upsertUserStat(userStat);

    // ---- Per-category ----
    // Iterate ALL categories: empty ones get their stale row deleted so the
    // next loadForUser doesn't resurrect a ghost category from disk.
    const categoryStats: CategoryStat[] = [];
    for (const category of CATEGORIES) {
      const subsetAll = all.filter((p) => p.category === category);
      if (subsetAll.length === 0) {
        await deleteCategoryStat(userId, category);
        continue;
      }
      const subsetResolved = resolved.filter((p) => p.category === category);
      const calc = computeCalibration(subsetResolved);
      const resolvedCount = subsetResolved.filter(isYesNo).length;
      const stat: CategoryStat = {
        user_id: userId,
        category,
        predictions_made: subsetAll.length,
        predictions_resolved: resolvedCount,
        calibration_score: calc.rating,
        badge_level: evaluateBadge(resolvedCount, calc.rating),
      };
      await upsertCategoryStat(stat);
      categoryStats.push(stat);
    }

    set({ userStat, categoryStats, calibration: userCalc });
  },
}));
