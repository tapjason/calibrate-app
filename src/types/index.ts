// ============================================================================
// Shared domain types. Per CLAUDE.md conventions, this file is the single
// source of truth — never redefine Prediction, UserStat, or CategoryStat
// elsewhere.
//
// Structure:
//   1. Data shapes  — what flows through the app (records, unions)
//   2. Contracts    — function-type aliases L2 (db) and L3 (engine) implement
// ============================================================================

// ----------------------------------------------------------------------------
// 1. Data shapes
// ----------------------------------------------------------------------------

// ---- Calibration constants ----
// Runtime values, not just types. Kept in L1 so both the engine (L3, which may
// import only from @/types) and the stores read the same source of truth.

/**
 * Minimum resolved predictions before the overall rating stops being
 * provisional. Below this, a bucket's actual_rate is too noisy to headline.
 */
export const MIN_N_OVERALL = 20;

/**
 * Minimum resolved predictions in a single category before its score stops
 * being provisional and badges above `tracker` may be awarded.
 */
export const MIN_N_CATEGORY = 15;

export type Category = 'work' | 'health' | 'finance' | 'social' | 'personal';

export type PredictionStatus =
  | 'pending'
  | 'resolved_yes'
  | 'resolved_no'
  | 'skipped';

/** Status values that represent a resolved (no longer pending) prediction. */
export type ResolvedStatus = Exclude<PredictionStatus, 'pending'>;

export type BadgeLevel =
  | 'guesser'
  | 'tracker'
  | 'forecaster'
  | 'sharp'
  | 'oracle';

export interface Prediction {
  id: string;
  user_id: string;
  title: string;
  category: Category;
  confidence: number;       // 0–100 integer
  created_at: string;       // ISO timestamp
  due_date: string;         // ISO timestamp
  status: PredictionStatus;
  resolved_at: string | null;
  reflection: string | null;
  integrity_bonus: boolean; // true if confidence was 35–65%
}

export interface UserStat {
  user_id: string;
  calibration_rating: number; // rolling 0–100
  total_predictions: number;
  total_resolved: number;
  current_streak: number;
  rating_is_provisional: boolean; // true while total_resolved < MIN_N_OVERALL
}

export interface CategoryStat {
  user_id: string;
  category: Category;
  predictions_made: number;
  predictions_resolved: number;
  calibration_score: number;
  score_is_provisional: boolean; // true while predictions_resolved < MIN_N_CATEGORY
  badge_level: BadgeLevel;
}

/** Where a Plus entitlement came from. `none` = free tier. */
export type EntitlementSource =
  | 'none'
  | 'trial'
  | 'monthly'
  | 'annual'
  | 'lifetime';

/**
 * Plus entitlement. Source of truth is RevenueCat server-side; SQLite holds a
 * local mirror for offline gating. Absence or any error must default to FREE
 * (`is_plus: false`), never to Plus — see CLAUDE.md.
 */
export interface Entitlement {
  is_plus: boolean;
  source: EntitlementSource;
  expires_at: string | null;
}

/**
 * The safe default. Every read that finds no row or errors resolves to this —
 * the app fails to FREE, never to Plus.
 */
export const FREE_ENTITLEMENT: Entitlement = {
  is_plus: false,
  source: 'none',
  expires_at: null,
};

// ---- Coach agent (Plus). Authoritative shapes: COACH_AGENT.md §4 and §6. ----

/**
 * The minimal, aggregated snapshot the Coach sees. Numbers only — raw
 * prediction titles / reflections are NOT included by default (freetext rule,
 * COACH_AGENT.md §4). The app computes every figure here; the model only
 * interprets them.
 */
export interface CoachContext {
  overall: { calibration_rating: number; total_resolved: number };
  by_category: Array<{
    category: Category;
    resolved: number;
    calibration_score: number;
    mean_stated_confidence: number;
    actual_rate: number;
    direction: Direction;
  }>;
  /** Deterministic patterns from the L3 engine (e.g. day-of-week accuracy). */
  patterns: Array<{ kind: string; value: number }>;
}

export type CoachInsightType =
  | 'overconfidence'
  | 'underconfidence'
  | 'strength'
  | 'pattern'
  | 'encouragement';

export interface CoachInsight {
  type: CoachInsightType;
  category: Category | 'overall';
  message: string; // <= 240 chars, framed around the data
  evidence: number; // must match a value in CoachContext, or the insight is dropped
  suggestion?: string; // optional, calibration-focused only
}

/**
 * Coach response. `safe: false` means the input tripped the crisis pre-filter
 * (COACH_AGENT.md §5.5) — suppress all insights and show the support surface.
 * `insights` is 0–3 items; 0 is valid (e.g. insufficient data).
 */
export interface CoachOutput {
  insights: CoachInsight[];
  safe: boolean;
}

/**
 * Wire-shape of a prediction crossing the Supabase boundary. Same fields as
 * Prediction plus `updated_at` (the last-write-wins timestamp). The local
 * `dirty` flag is NOT included — it lives only in SQLite and is meaningless
 * to Postgres.
 *
 * Intentionally not surfaced into the UI. The L4 stores still hand out
 * Prediction objects; only L5 sync code reaches for this shape.
 */
export interface PredictionWireRow {
  id: string;
  user_id: string;
  title: string;
  category: Category;
  confidence: number;
  created_at: string;
  due_date: string;
  status: PredictionStatus;
  resolved_at: string | null;
  reflection: string | null;
  integrity_bonus: boolean;
  updated_at: string;
}

/** Per-bucket result produced by the calibration engine. */
export interface BucketStat {
  low: number;                    // bucket lower bound (inclusive), e.g. 60
  high: number;                   // bucket upper bound (exclusive), e.g. 80
  total_resolved: number;
  resolved_yes: number;
  stated_confidence_mean: number; // mean user-stated confidence in this bucket
  actual_rate: number;            // resolved_yes / total_resolved
  bucket_error: number;           // | stated_confidence_mean/100 − actual_rate |
}

/** Aggregate result of running the calibration engine on a set of predictions. */
export interface CalibrationResult {
  rating: number;        // 0–100 calibration score
  buckets: BucketStat[]; // one entry per non-empty bucket
}

/**
 * Whether stated confidence ran ahead of, behind, or in line with reality.
 * One shared definition for the Warmup verdict, per-category Coach direction,
 * and any other over/under read — see engine/patterns.ts `classifyDirection`.
 */
export type Direction = 'overconfident' | 'underconfident' | 'calibrated';

// ---- Warmup (onboarding quiz) ----
//
// The Day-0 aha: a short estimation quiz scored by the SAME calibration engine.
// Warmup data is stored separately and NEVER mixed into real UserStat /
// CategoryStat (CLAUDE.md Warmup Module).

/** One answered Warmup question: a binary-choice item with a 50–100% confidence. */
export interface WarmupAnswer {
  confidence: number; // 50–100 stated confidence (50 = coin flip on a 2-way choice)
  correct: boolean;   // whether the user's pick was right
}

/**
 * A Warmup quiz item. Two options, one right — a binary choice is what makes
 * 50% the honest floor of the confidence slider, since a coin flip already
 * gets you there.
 */
export interface WarmupQuestion {
  id: string;
  prompt: string;
  options: readonly [string, string];
  correctIndex: 0 | 1;
  /** Shown after answering — the "oh, really?" beat that makes the quiz stick. */
  fact: string;
}

/**
 * A completed Warmup, as persisted. Only the raw answers are stored: the
 * scored WarmupResult is derived by the engine (L3) on read, so a scoring
 * change can never leave a stale verdict on disk. `completed_at` doubles as
 * the "has this user finished onboarding?" flag.
 */
export interface WarmupRecord {
  completed_at: string; // ISO timestamp
  answers: WarmupAnswer[];
}

/**
 * Scored Warmup result. `direction` is the headline verdict ("you run
 * overconfident") from overall stated confidence vs. actual accuracy;
 * `mini_score` and `buckets` drive the mini calibration chart, using the same
 * MAE engine as real predictions.
 */
export interface WarmupResult {
  answered: number;         // questions answered
  mean_confidence: number;  // mean stated confidence, 0–100
  accuracy: number;         // fraction correct, 0–1
  mini_score: number;       // 0–100 calibration score
  direction: Direction;
  buckets: BucketStat[];    // non-empty confidence buckets, for the chart
}

// ----------------------------------------------------------------------------
// 2. Contracts — function-type aliases
//
// These are the signatures L2 (data access) and L3 (engine) modules must
// satisfy. Implementations declare `const fn: AliasName = (...) => ...` so the
// compiler enforces the shape from one place.
// ----------------------------------------------------------------------------

// ---- Engine (L3) ----

/** Compute calibration buckets and rolling score from resolved predictions. */
export type ComputeCalibration = (resolved: Prediction[]) => CalibrationResult;

/** Decide the badge level for a category given its rolled-up stats. */
export type EvaluateBadge = (
  predictionsResolved: number,
  calibrationScore: number,
) => BadgeLevel;

/**
 * The next badge above the user's current one, with the absolute thresholds
 * required to reach it. `null` fields mean that dimension isn't a gate for
 * this badge. The whole result is `null` when the user is already at the top
 * (oracle).
 */
export interface NextBadgeTarget {
  badge: BadgeLevel;
  needResolved: number | null; // total resolutions required (≥)
  needScore: number | null; // calibration score must exceed this (>)
}

/** Look up the next badge up the ladder and what it takes to get there. */
export type NextBadge = (
  predictionsResolved: number,
  calibrationScore: number,
) => NextBadgeTarget | null;

/** Consecutive days, counting back from the latest resolved_at, with ≥1 resolution. */
export type ComputeStreak = (resolved: Prediction[]) => number;

// ---- DB: predictions (L2) ----

export type InsertPrediction = (p: Prediction) => Promise<void>;
export type GetPrediction = (id: string) => Promise<Prediction | null>;
export type ListPendingPredictions = (userId: string) => Promise<Prediction[]>;
export type ListResolvedPredictions = (userId: string) => Promise<Prediction[]>;
export type ResolvePrediction = (
  id: string,
  outcome: ResolvedStatus,
  reflection?: string,
) => Promise<void>;
export type DeletePrediction = (id: string) => Promise<void>;

// ---- DB: stats (L2) ----

export type GetUserStat = (userId: string) => Promise<UserStat | null>;
export type UpsertUserStat = (stat: UserStat) => Promise<void>;
export type GetCategoryStat = (
  userId: string,
  category: Category,
) => Promise<CategoryStat | null>;
export type UpsertCategoryStat = (stat: CategoryStat) => Promise<void>;
export type DeleteCategoryStat = (
  userId: string,
  category: Category,
) => Promise<void>;
export type ListCategoryStats = (userId: string) => Promise<CategoryStat[]>;

// ---- DB: entitlements (L2) ----
//
// A device-local mirror of the RevenueCat entitlement, for offline gating.
// getEntitlement never returns null — a missing row resolves to FREE_ENTITLEMENT
// so callers cannot accidentally treat "no data" as Plus.

export type GetEntitlement = () => Promise<Entitlement>;
export type UpsertEntitlement = (e: Entitlement) => Promise<void>;

// ---- DB: warmup (L2) ----
//
// Onboarding-quiz storage, deliberately in its own table with no user_id and
// no join to predictions. Warmup answers are NOT predictions and must never
// reach UserStat / CategoryStat (CLAUDE.md Warmup Module) — keeping them
// physically unjoinable is what makes that guarantee structural rather than a
// convention someone has to remember.

export type GetWarmupRecord = () => Promise<WarmupRecord | null>;
export type SaveWarmupRecord = (record: WarmupRecord) => Promise<void>;
export type ClearWarmupRecord = () => Promise<void>;
