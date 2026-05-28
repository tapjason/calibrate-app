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
}

export interface CategoryStat {
  user_id: string;
  category: Category;
  predictions_made: number;
  predictions_resolved: number;
  calibration_score: number;
  badge_level: BadgeLevel;
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
  bucket_error: number;           // (stated_confidence_mean/100 − actual_rate)²
}

/** Aggregate result of running the calibration engine on a set of predictions. */
export interface CalibrationResult {
  rating: number;        // 0–100 calibration score
  buckets: BucketStat[]; // one entry per non-empty bucket
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
