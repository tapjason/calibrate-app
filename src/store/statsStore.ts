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
  computeBrier,
  brierEdge,
  type BrierEdge,
  computeBrierBaseline,
  computeRatingRange,
  evaluateBadge,
  isRatingProvisional,
  isScoreProvisional,
  nextBadge,
  perfectReference,
  badgeChangesSince,
} from '@/engine/calibration';

/** For the Brier line's words (step 173), so components needn't reach the engine. */
export type { BrierEdge };
import {
  coverageGap as computeCoverageGap,
  evaluateCoverageNudge,
  type CoverageGap,
  type CoverageNudgeDecision,
} from '@/engine/coverageNudge';
import { detectMilestone, detectTierDrop } from '@/engine/milestones';
import { isSameDayAnswer, readyScoredCount, sameDayCount, scoredOnly } from '@/engine/sameDay';
import { computeStreak } from '@/engine/streak';
import { buildTrendSummary, type TrendSummary } from '@/engine/trends';
import { categoriesIn } from '@/engine/categories';
import { unlockEstimate } from '@/engine/pace';
import {
  categoryCounts,
  overallCounts,
  furthestOffCategory,
  weekChange,
  type CategoryMiss,
  type WeekChange,
} from '@/engine/patterns';
import {
  buildWrapped,
  weekWindow,
  yearWindow,
  type WrappedSpan,
  type WrappedSummary,
} from '@/engine/wrapped';
import {
  BRIER_MIN_N,
  type BadgeChange,
  MIN_N_OVERALL,
  type BucketStat,
  type CalibrationResult,
  type Category,
  type CategoryCounts,
  type CategoryStat,
  type Milestone,
  type TierDrop,
  type NextBadgeTarget,
  type PerfectReference,
  type Prediction,
  type RatingRange,
  type UnlockEstimate,
  type UserStat,
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
   * How much the overall rating could move with different luck (roadmap D4):
   * "92, give or take 3". Computed whenever the calibration is; the UI shows
   * it only once the rating has unlocked.
   */
  ratingRange: RatingRange | null;
  /**
   * The Brier score of every yes/no answer (roadmap D24): secondary and
   * quiet, so derived here on every recompute and never stored in UserStat.
   * The UI shows it only once the rating has unlocked. Null with none.
   */
  brier: number | null;
  /**
   * What always saying the base rate would score (roadmap D35), the Brier
   * line's yardstick. Derived with it; null with nothing resolved.
   */
  brierBaseline: { rate: number; score: number } | null;
  /** Whether the Brier score beats the base rate by more than luck (step 173). */
  brierEdge: BrierEdge | null;
  /**
   * What a perfectly calibrated person would score on the same answers (D62),
   * beside the rating once it's unlocked; null before.
   */
  perfect: PerfectReference | null;
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
   * Log screen's track record ("Of your 12 scored finance calls at 60–80%,
   * 7 happened."), roadmap step 19.
   */
  categoryCalibration: Partial<Record<Category, CalibrationResult>>;
  /**
   * Each category's give-or-take (roadmap D35), like `ratingRange` for the
   * rating: shown beside a category's score once it unlocks, and taken off
   * the score before a badge above Tracker is awarded.
   */
  categoryRanges: Partial<Record<Category, RatingRange>>;
  /**
   * The category furthest from what was said (roadmap D37), past the count
   * gate and by the one lean rule, or null. Insights names it in plain counts.
   */
  furthestOff: CategoryMiss | null;
  /** Each category's plain counts over scored answers (roadmap D53). */
  categoryCounts: Partial<Record<Category, CategoryCounts>>;
  /** The same over every category (D62), for the first look at 10. */
  overallCounts: CategoryCounts | null;
  /** The category's bucket a stated confidence falls in, or null. */
  categoryBucketFor: (category: Category, confidence: number) => BucketStat | null;
  /**
   * The line the last recompute crossed (score unlocked, badge tier-up), or
   * null. Set only by recomputeForUser, never by a load — reopening the app
   * is not an achievement. Whoever celebrates it clears it.
   */
  milestone: Milestone | null;
  clearMilestone: () => void;
  /**
   * The badge the last recompute took back, or null (roadmap D60 (a)): said
   * on the answer that moved it, never celebrated. Unlike a milestone it isn't
   * kept for later: a drop from a sync or a correction belongs to no answer.
   */
  tierDrop: TierDrop | null;
  /**
   * The rating as Today showed it just before a reminder's Happened or
   * Didn't recorded an answer, for Resolve's "moved from…" line (roadmap
   * D50), which opens after the write. Null while provisional.
   */
  ratingBeforeAnswer: { predictionId: string; rating: number | null } | null;
  /** Keep the shown rating before an answer recorded off-screen. */
  noteRatingBefore: (predictionId: string) => void;
  /** Read and clear what noteRatingBefore kept for this prediction. */
  takeRatingBefore: (predictionId: string) => number | null;
  /** Pull persisted stats from the DB into the store and refresh buckets. */
  loadForUser: (userId: string) => Promise<void>;
  /** Re-run the engine over all of a user's predictions and persist. */
  recomputeForUser: (userId: string) => Promise<void>;
  /**
   * Whether the numbers held here may not match the database (review round
   * 5): a write rolled back after its recompute had set them, and reading
   * them again failed too. While true, the rating before an answer is read
   * as unknown (`noteRatingBefore`), the next recompute takes its "before"
   * from the database, and the next load or recompute clears it. A screen
   * that reads `userStat` for a "before" figure should read none while this
   * is true.
   */
  stale: boolean;
  /** The derived numbers held now, for a failed write to put back. */
  heldStats: () => HeldStats;
  /**
   * After a failed write whose stats reload failed too: put back `held` (the
   * numbers as they were when the write began) if given, drop any milestone
   * or badge fall, and mark the stats stale.
   */
  markStale: (held?: HeldStats | null) => void;
}

const EMPTY_CALIBRATION: CalibrationResult = { rating: 0, buckets: [] };

const EMPTY_TRENDS: TrendSummary = buildTrendSummary([]);

const EMPTY_COVERAGE_GAP: CoverageGap = computeCoverageGap([]);

/** Map each category to its next-badge target (engine call lives here, in L4). */
function deriveNextBadges(
  stats: CategoryStat[],
  ranges: Partial<Record<Category, RatingRange>> = {},
): Partial<Record<Category, NextBadgeTarget | null>> {
  const out: Partial<Record<Category, NextBadgeTarget | null>> = {};
  for (const s of stats) {
    out[s.category] = nextBadge(
      s.predictions_resolved,
      s.calibration_score,
      ranges[s.category]?.giveOrTake ?? 0,
    );
  }
  return out;
}

function isYesNo(p: Prediction): boolean {
  return p.status === 'resolved_yes' || p.status === 'resolved_no';
}

/** Per-category calibration for the categories that have any resolutions. */
function deriveCategoryCalibration(
  resolved: readonly Prediction[],
): Partial<Record<Category, CalibrationResult>> {
  const out: Partial<Record<Category, CalibrationResult>> = {};
  for (const category of categoriesIn(resolved)) {
    const subset = resolved.filter((p) => p.category === category);
    if (subset.length > 0) out[category] = computeCalibration(subset);
  }
  return out;
}

function deriveCategoryRanges(
  resolved: readonly Prediction[],
): Partial<Record<Category, RatingRange>> {
  const out: Partial<Record<Category, RatingRange>> = {};
  for (const category of categoriesIn(resolved)) {
    const range = computeRatingRange(resolved.filter((p) => p.category === category));
    if (range) out[category] = range;
  }
  return out;
}

type DerivedStats = Pick<
  StatsState,
  | 'categoryStats'
  | 'nextBadges'
  | 'calibration'
  | 'categoryCalibration'
  | 'categoryRanges'
  | 'furthestOff'
  | 'categoryCounts'
  | 'overallCounts'
  | 'trends'
  | 'ratingRange'
  | 'brier'
  | 'brierBaseline'
  | 'brierEdge'
  | 'perfect'
  | 'coverageGap'
> & { userStat: UserStat };

/**
 * The derived numbers held in memory, the user's stat included (null before
 * any), as `heldStats` reads them and `markStale` puts them back.
 */
export type HeldStats = Omit<DerivedStats, 'userStat'> & { userStat: UserStat | null };

/**
 * The stats as the database last stored them, for a recompute whose memory
 * is stale: what the last committed write left, since every write stores its
 * recompute in its own transaction. Read before the rebuild writes new ones.
 */
async function storedStats(
  userId: string,
): Promise<{ userStat: UserStat | null; categoryStats: CategoryStat[] }> {
  const [userStat, categoryStats] = await Promise.all([
    getUserStat(userId),
    listCategoryStats(userId),
  ]);
  return { userStat, categoryStats };
}

/**
 * Re-run the engine over all of a user's predictions and persist the result.
 * Full, not incremental: simpler and bug-free, and N is small. Shared by
 * recomputeForUser (after a write) and loadForUser (at launch).
 */
async function rebuildStats(userId: string): Promise<DerivedStats> {
  const [pending, answered] = await Promise.all([
    listPendingPredictions(userId),
    listResolvedPredictions(userId),
  ]);
  // Every prediction for the streak, the counts and coverage; only the
  // scored answers for anything calibrated (same-day ones aren't, D41).
  const all = [...pending, ...answered];
  const resolved = scoredOnly(answered);

  // ---- User-level ----
  const userCalc = computeCalibration(resolved);
  const totalResolved = resolved.filter(isYesNo).length;
  const userStat: UserStat = {
    user_id: userId,
    calibration_rating: userCalc.rating,
    total_predictions: all.length,
    total_resolved: totalResolved,
    // Every prediction, open ones too: logging counts toward a day (D2).
    current_streak: computeStreak(all, { now: new Date() }),
    rating_is_provisional: isRatingProvisional(totalResolved),
  };
  await upsertUserStat(userStat);

  // ---- Per-category ----
  // Every category with a stat row or a prediction, the person's own
  // included (roadmap D39): empty ones get their stale row deleted so the
  // next loadForUser doesn't resurrect a ghost category from disk.
  const categoryStats: CategoryStat[] = [];
  const categoryCalibration: Partial<Record<Category, CalibrationResult>> = {};
  const categoryRanges: Partial<Record<Category, RatingRange>> = {};
  const stored = (await listCategoryStats(userId)).map((s) => s.category);
  const used = categoriesIn(all);
  const walk = [...used, ...stored.filter((c) => !used.includes(c))];
  for (const category of walk) {
    const subsetAll = all.filter((p) => p.category === category);
    if (subsetAll.length === 0) {
      await deleteCategoryStat(userId, category);
      continue;
    }
    const subsetResolved = resolved.filter((p) => p.category === category);
    const calc = computeCalibration(subsetResolved);
    if (subsetResolved.length > 0) categoryCalibration[category] = calc;
    const resolvedCount = subsetResolved.filter(isYesNo).length;
    // The category's own give-or-take (roadmap D35): shown beside its score,
    // and a badge above Tracker needs the score minus it to clear the bar.
    const range = computeRatingRange(subsetResolved);
    if (range) categoryRanges[category] = range;
    const stat: CategoryStat = {
      user_id: userId,
      category,
      predictions_made: subsetAll.length,
      predictions_resolved: resolvedCount,
      calibration_score: calc.rating,
      score_is_provisional: isScoreProvisional(resolvedCount),
      badge_level: evaluateBadge(resolvedCount, calc.rating, range?.giveOrTake ?? 0),
    };
    await upsertCategoryStat(stat);
    categoryStats.push(stat);
  }

  return {
    userStat,
    categoryStats,
    nextBadges: deriveNextBadges(categoryStats, categoryRanges),
    calibration: userCalc,
    categoryCalibration,
    categoryRanges,
    furthestOff: furthestOffCategory(resolved),
    categoryCounts: categoryCounts(resolved),
    overallCounts: overallCounts(resolved),
    trends: buildTrendSummary(resolved),
    ratingRange: computeRatingRange(resolved),
    brier: computeBrier(resolved),
    brierBaseline: computeBrierBaseline(resolved),
    // Shown only from BRIER_MIN_N scored answers (D62), so not
    // bootstrapped before (code review 2026-11-12).
    brierEdge: userStat.total_resolved < BRIER_MIN_N ? null : brierEdge(resolved),
    // Beside the rating only, so only once it's unlocked (D62).
    perfect: userStat.rating_is_provisional ? null : perfectReference(resolved),
    coverageGap: computeCoverageGap(all),
  };
}

export const useStatsStore = create<StatsState>((set, get) => ({
  userStat: null,
  categoryStats: [],
  nextBadges: {},
  calibration: EMPTY_CALIBRATION,
  categoryCalibration: {},
  categoryRanges: {},
  furthestOff: null,
  categoryCounts: {},
  overallCounts: null,
  trends: EMPTY_TRENDS,
  ratingRange: null,
  brier: null,
  brierBaseline: null,
  brierEdge: null,
  perfect: null,
  coverageGap: EMPTY_COVERAGE_GAP,
  milestone: null,
  tierDrop: null,
  stale: false,

  clearMilestone: () => set({ milestone: null, tierDrop: null }),

  heldStats: () => {
    const s = get();
    return {
      userStat: s.userStat,
      categoryStats: s.categoryStats,
      nextBadges: s.nextBadges,
      calibration: s.calibration,
      categoryCalibration: s.categoryCalibration,
      categoryRanges: s.categoryRanges,
      furthestOff: s.furthestOff,
      categoryCounts: s.categoryCounts,
      overallCounts: s.overallCounts,
      trends: s.trends,
      ratingRange: s.ratingRange,
      brier: s.brier,
      brierBaseline: s.brierBaseline,
      brierEdge: s.brierEdge,
      perfect: s.perfect,
      coverageGap: s.coverageGap,
    };
  },

  markStale: (held) =>
    set({ ...(held ?? {}), stale: true, milestone: null, tierDrop: null }),

  ratingBeforeAnswer: null,
  noteRatingBefore: (predictionId) => {
    // Unknown while stale: memory may hold a rating the database doesn't.
    const stat = get().stale ? null : get().userStat;
    const rating = stat && !stat.rating_is_provisional ? Math.round(stat.calibration_rating) : null;
    set({ ratingBeforeAnswer: { predictionId, rating } });
  },
  takeRatingBefore: (predictionId) => {
    const kept = get().ratingBeforeAnswer;
    if (!kept || kept.predictionId !== predictionId) return null;
    set({ ratingBeforeAnswer: null });
    return kept.rating;
  },

  bucketFor: (confidence) => {
    const low = bucketLowFor(confidence);
    return get().calibration.buckets.find((b) => b.low === low) ?? null;
  },

  categoryBucketFor: (category, confidence) => {
    const low = bucketLowFor(confidence);
    return get().categoryCalibration[category]?.buckets.find((b) => b.low === low) ?? null;
  },

  loadForUser: async (userId) => {
    // Stored stats are rebuilt, not trusted: they were computed by whatever
    // engine ran at the last write, and a formula change (D24 weighted the
    // rating by count) would otherwise show the old number, and the old
    // badges, until the next answer. A rebuild is cheap (N is small) and sets
    // no milestone: reopening the app is not an achievement.
    if (await getUserStat(userId)) {
      set({ ...(await rebuildStats(userId)), stale: false });
      return;
    }
    // Nothing computed yet (no write since install or erase): show what the
    // predictions give without writing a row for a user who has none.
    const [categoryStats, answered, pending] = await Promise.all([
      listCategoryStats(userId),
      listResolvedPredictions(userId),
      listPendingPredictions(userId),
    ]);
    const resolved = scoredOnly(answered);
    const ranges = deriveCategoryRanges(resolved);
    set({
      userStat: null,
      categoryStats,
      nextBadges: deriveNextBadges(categoryStats, ranges),
      calibration: computeCalibration(resolved),
      categoryCalibration: deriveCategoryCalibration(resolved),
      categoryRanges: ranges,
      furthestOff: furthestOffCategory(resolved),
      categoryCounts: categoryCounts(resolved),
      overallCounts: overallCounts(resolved),
      trends: buildTrendSummary(resolved),
      ratingRange: computeRatingRange(resolved),
      brier: computeBrier(resolved),
      brierBaseline: computeBrierBaseline(resolved),
      // No user stat here, so no Brier line to word.
      brierEdge: null,
      perfect: null,
      coverageGap: computeCoverageGap([...pending, ...answered]),
      stale: false,
    });
  },

  recomputeForUser: async (userId) => {
    const held = get();
    // "Before" for the milestone and a badge's fall: memory, or, while it is
    // stale, what the database stored at the last committed write (review
    // round 5). A moment is never claimed from numbers that may be wrong, and
    // a write retried after a failure still earns the line it crosses.
    const prev = held.stale
      ? await storedStats(userId)
      : { userStat: held.userStat, categoryStats: held.categoryStats };
    const next = await rebuildStats(userId);
    const milestone = detectMilestone(
      prev.userStat,
      prev.categoryStats,
      next.userStat,
      next.categoryStats,
    );
    // Keep an uncelebrated milestone rather than overwrite it with null
    // (markStale already dropped any from a write that didn't land).
    set({
      ...next,
      stale: false,
      milestone: milestone ?? held.milestone,
      tierDrop: detectTierDrop(prev.categoryStats, next.categoryStats),
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
export function coverageNudgeNow(lastAnsweredAt: string | null = null): CoverageNudgeDecision {
  return evaluateCoverageNudge(
    useStatsStore.getState().coverageGap,
    useSettingsStore.getState().coverageNudgeLastShownAt,
    new Date().toISOString(),
    lastAnsweredAt,
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
  return buildWrapped(scoredOnly(resolved), span, now);
}

/**
 * The badges gained or lost over a recap's span (D62), from the scored
 * answers, for the recap to lead with. Called through here so Share never
 * imports the engine.
 */
export function wrappedBadgeChanges(
  resolved: readonly Prediction[],
  span: WrappedSpan,
  now: Date = new Date(),
): BadgeChange[] {
  const { start } = span === 'week' ? weekWindow(now) : yearWindow(now);
  // "Now" is the badge Insights shows. Never "Back to Getting started": that
  // tier stays off anything shared (D27).
  const current = new Map(
    useStatsStore.getState().categoryStats.map((c) => [c.category, c.badge_level] as const),
  );
  return badgeChangesSince(scoredOnly(resolved), start, current).filter(
    (c) => c.to !== 'guesser',
  );
}

/**
 * Re-exported so Layer 6 never imports the engine directly. The decision is
 * produced here by `coverageNudgeNow()`; the type travels with it.
 */
export type { CoverageGap, CoverageNudgeDecision, WrappedSpan, WrappedSummary };

/**
 * "Since last week" (roadmap D37): the rating now against a week ago, from
 * the resolved list the caller holds. Read at render, since it depends on the
 * day; the engine does the arithmetic, screens read it here.
 */
export function weekChangeFor(resolved: readonly Prediction[], now: Date): WeekChange | null {
  return weekChange(scoredOnly(resolved), now);
}

/**
 * Same-day answers (roadmap D41): given on the day the prediction was
 * logged, so not scored. The rule is the engine's; screens read it here.
 */
export function answeredSameDay(p: Prediction): boolean {
  return isSameDayAnswer(p);
}

/** How many answers in the list aren't scored for being same-day (D41). */
export function sameDayAnswerCount(resolved: readonly Prediction[]): number {
  return sameDayCount(resolved);
}

/**
 * When the rating could unlock at the recent pace (roadmap D53), from the
 * lists the caller holds: the pace over scored answers, read over the days
 * since the first prediction was logged. Read at render, since it depends on
 * the day.
 */
export function unlockEstimateFor(
  resolved: readonly Prediction[],
  pending: readonly Prediction[],
  now: Date,
): UnlockEstimate | null {
  let first: string | null = null;
  for (const p of [...resolved, ...pending]) {
    if (first === null || Date.parse(p.created_at) < Date.parse(first)) first = p.created_at;
  }
  const scored = scoredOnly(resolved).filter(isYesNo);
  // No forecast when what's ready now would unlock it: "One is ready to
  // answer now" beside "about 2 days" read as two answers to one question
  // (blind playtest 2026-11-13c, finding 19). Ready means due today or
  // earlier, and scored if answered now (not logged or reworded today, D41).
  const toGo = MIN_N_OVERALL - scored.length;
  if (toGo > 0 && readyScoredCount(pending, now) >= toGo) return null;
  return unlockEstimate(scored, MIN_N_OVERALL, now, first);
}

export type { CategoryMiss, WeekChange };
