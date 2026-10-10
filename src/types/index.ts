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

/**
 * Minimum resolved predictions in one confidence band before anything is said
 * about that band: the chart's verdict, the Log screen's track record, the
 * correction table. Ten is where a band's rate stops jumping in 10-point
 * steps; below it, counts only.
 */
export const MIN_N_BAND = 10;

/**
 * Predictions logged or answered yes/no in one local day for it to count
 * toward the streak. Three when the streak was decided (2026-10-05, UI_ROADMAP
 * D2); one since D17 (2026-10-07): Duolingo's A/B test of letting a single
 * lesson extend a streak, instead of the daily goal, raised day-14 retention
 * 3.3% (research/retention-2026-10.md §2.1).
 */
export const STREAK_DAY_MIN = 1;

/**
 * The day's goal (D17): three logged or answered fill today's dots on the
 * streak row. A goal, not a gate: the streak doesn't need it.
 */
export const DAILY_GOAL = 3;

/**
 * Streak lengths that are milestones (decided 2026-10-06): a week, a month, a
 * hundred days, a year. Past the last one, every further year (730, 1095…).
 * The streak climbs every day; only these days are marked.
 */
export const STREAK_CHECKPOINTS = [7, 30, 100, 365] as const;

/**
 * Rest days (decided 2026-10-07, BUILT_LOG step 87): every REST_DAY_EVERY
 * counted days in a streak save one, up to REST_DAYS_MAX. A past day that
 * didn't count spends one and the streak carries on without adding that day;
 * with none saved, it ends. An emergency reserve in Sharif & Shu's sense:
 * finite, earned, and spent automatically (research/retention-2026-10.md §2.2).
 */
export const REST_DAY_EVERY = 7;
export const REST_DAYS_MAX = 2;

/**
 * What a set of answers came to, in counts (roadmap step 65): the end of a
 * run says it. `expected` is the sum of stated confidences as a count, like
 * Wrapped's: three answers at 70% expect 2.1.
 */
export interface AnswerTally {
  /** Answered yes or no. */
  resolved: number;
  /** Of those, how many happened. */
  happened: number;
  expected: number;
  /** Marked "can't tell", which count for nothing. */
  skipped: number;
}

/** Where today stands for the streak, as the engine reports it. */
export interface StreakStatus {
  /** Consecutive counted days, through today if it counts, else yesterday. */
  streak: number;
  /** Predictions logged or answered so far today. */
  today: number;
  /** Whether today has reached STREAK_DAY_MIN. */
  todayCounts: boolean;
  /**
   * The checkpoint today reached, or null. Set only on the day itself, once
   * it counts: a 7-day streak is a milestone on day 7, not on day 8.
   */
  checkpoint: number | null;
  /** The smallest checkpoint above the streak: what it's climbing toward. */
  nextCheckpoint: number;
  /** Rest days saved now, 0..REST_DAYS_MAX. */
  restDays: number;
  /**
   * How many days just before today were covered by a rest day (0 when
   * yesterday counted or the streak has ended): "Yesterday was a rest day".
   */
  restUsed: number;
  /** Today counted and brought a rest day (day 7, 14, 21… with room to save it). */
  restEarnedToday: boolean;
  /** The streak length that saves the next rest day, or null while the reserve is full. */
  nextRestAt: number | null;
}

export type Category = 'work' | 'health' | 'finance' | 'social' | 'personal';

/**
 * Every category, in the one order the app lists them: Log's chips, History's
 * filters, Stats' badges. Stats loaded its badges alphabetically at launch and
 * in this order after a recompute, so the rows changed places after the
 * session's first log or answer.
 */
export const CATEGORIES: readonly Category[] = ['work', 'health', 'finance', 'social', 'personal'];

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
  current_streak: number; // days with ≥ 1 logged or answered, in a row but for saved rest days
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
  /**
   * Which CoachContext figure `evidence` matched. Set by the client validator,
   * never read from the model's output, and left out when the number matches
   * more than one kind of figure — the card then shows no receipt rather
   * than a guessed one (COACH_AGENT.md §6, DESIGN_SYSTEM §7.13).
   */
  evidence_source?: CoachEvidenceSource;
}

export type CoachEvidenceField =
  | 'calibration_rating'
  | 'total_resolved'
  | 'resolved'
  | 'calibration_score'
  | 'mean_stated_confidence'
  | 'actual_rate'
  | 'pattern';

export interface CoachEvidenceSource {
  field: CoachEvidenceField;
  /** The category the figure belongs to, or 'overall'. */
  scope: Category | 'overall';
  /** The figure as the app computed it (actual_rate stays 0–1). */
  value: number;
  /** Pattern key, when field is 'pattern' (e.g. 'weakest_day_of_week'). */
  kind?: string;
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
  direction: Direction;           // which side of the diagonal (5-pt band = calibrated)
  /**
   * Where actual_rate would land half the time for a perfectly calibrated
   * forecaster at this bucket's stated mean and n: the central 50% of the
   * binomial outcomes, as shares 0–1 (roadmap D4). Small buckets get wide ranges.
   */
  chance_low: number;
  chance_high: number;
  /** How many the stated confidences expected to happen: n × stated mean / 100. */
  expected_yes: number;
}

/**
 * A line crossed by the last recompute, worth one of the design system's few
 * celebrations (DESIGN_SYSTEM §6.2). Upward crossings only.
 */
export type Milestone =
  | { kind: 'rating_unlocked'; rating: number }
  /** `from` is the tier before, so the tier-up can flip from it (a jump can skip a rung). */
  | { kind: 'tier_up'; category: Category; badge: BadgeLevel; from: BadgeLevel }
  | { kind: 'category_unlocked'; category: Category; score: number };

/** Aggregate result of running the calibration engine on a set of predictions. */
export interface CalibrationResult {
  rating: number;        // 0–100 calibration score
  buckets: BucketStat[]; // one entry per non-empty bucket
}

/**
 * How much the rating could move on the same habits with different luck
 * (roadmap D4): half the spread of the middle 80% of bootstrap scores, set
 * either side of the rating itself. Whole points, clamped to 0–100.
 */
export interface RatingRange {
  /** "give or take" this many points. */
  giveOrTake: number;
  low: number;
  high: number;
}

/**
 * Whether stated confidence ran ahead of, behind, or in line with reality.
 * One shared definition for per-category Coach direction and any other
 * over/under read — see engine/patterns.ts `classifyDirection`. The Warmup uses
 * the same three values but decides them from the chance range (warmup.ts).
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

// ---- Share cards ----
//
// The growth engine. Per CLAUDE.md nothing that produces a shareable artifact
// is ever paywalled, and the per-category contrast ("Sharp in health, Guesser
// in money") is the thing that actually travels.

/** One category as it appears on a share card. */
export interface ShareCardCategory {
  category: Category;
  badge_level: BadgeLevel;
}

/**
 * Everything a share card needs to render and export. Data only — the copy is
 * built from it by components/share/cardCopy.ts.
 *
 * `rating` is null while the overall rating is provisional. A card is the most
 * public thing this app produces, so it is the last place a number built on
 * noise belongs; the card shows progress toward the threshold instead.
 */
export interface ShareCard {
  /** Best badge first, worst last — the contrast is the point. */
  categories: ShareCardCategory[];
  rating: number | null;
  total_resolved: number;
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

// ---- Daily practice (roadmap step 88) ----
//
// Three two-choice questions a day, the same three for everyone on the same
// local day, drawn at random from reference tables rather than picked to be
// tricky (research/retention-2026-10.md §2.5). Practice is practice: like the
// Warmup it is stored on its own and never mixed into UserStat/CategoryStat,
// the streak, or anything else that describes the user's real predictions.

/** Questions a day. */
export const PRACTICE_PER_DAY = 3;

/**
 * Answers before the practice record says which way someone leans, or draws
 * its chart: the same floor as the real rating (MIN_N_OVERALL), for the same
 * reason. Below it, counts only.
 */
export const PRACTICE_MIN_N = 20;

/** What a practice question compares. */
export type PracticeKind =
  | 'north' // city latitudes
  | 'east' // city longitudes (pairs less than 90° apart, so "east" is unambiguous)
  | 'area' // country areas
  | 'height' // mountain heights
  | 'size' // diameters of solar-system bodies
  | 'first' // years of events
  | 'born' // birth years
  | 'element'; // atomic numbers

export const PRACTICE_KINDS: readonly PracticeKind[] = [
  'north',
  'east',
  'area',
  'height',
  'size',
  'first',
  'born',
  'element',
];

export interface PracticePlace {
  name: string;
  /** Degrees, north positive. */
  lat: number;
  /** Degrees, east positive. */
  lon: number;
}

/** A named quantity: a country's area in km², a mountain's height in m, a diameter in km. */
export interface PracticeMeasure {
  name: string;
  value: number;
  /** The option's label when the name alone may not say what it is ("Titan (Saturn's moon)"). */
  label?: string;
}

export interface PracticeEvent {
  /** The option: "The Eiffel Tower opens". */
  name: string;
  /** The answer key's sentence: "The Eiffel Tower opened in 1889". */
  said: string;
  year: number;
}

export interface PracticePerson {
  name: string;
  born: number;
}

export interface PracticeElement {
  name: string;
  /** Atomic number. */
  z: number;
}

/** The reference tables questions are drawn from (constants/practiceFacts.ts). */
export interface PracticeFacts {
  places: readonly PracticePlace[];
  countries: readonly PracticeMeasure[];
  mountains: readonly PracticeMeasure[];
  bodies: readonly PracticeMeasure[];
  events: readonly PracticeEvent[];
  people: readonly PracticePerson[];
  elements: readonly PracticeElement[];
}

/** One day's question: the Warmup's shape, plus what it compares. */
export interface PracticeQuestion extends WarmupQuestion {
  kind: PracticeKind;
}

/**
 * One answered practice question, as stored. The question itself is kept with
 * the answer, so a later change to the tables never rewrites what was asked.
 */
export interface PracticeAnswer {
  /** The local day it was asked for (engine/localTime localDayNumber). */
  day: number;
  /** 0..PRACTICE_PER_DAY-1 within the day. */
  slot: number;
  question: PracticeQuestion;
  picked: 0 | 1;
  correct: boolean;
  /** 50–100, as in the Warmup: two options make 50% the floor. */
  confidence: number;
  answered_at: string;
}

/** One day's practice in counts: "2 of 3 right. You expected about 2.4." */
export interface PracticeDayTally {
  answered: number;
  correct: number;
  /** The sum of stated confidences as a count, like Wrapped's expected. */
  expected: number;
}

/** Everything practised so far, as the practice sheet shows it. */
export interface PracticeRecord {
  answered: number;
  correct: number;
  /** Distinct days with at least one answer. */
  days: number;
  /** Mean stated confidence, 0–100 (0 with no answers). */
  mean_confidence: number;
  /** Fraction correct, 0–1. */
  accuracy: number;
  /** Which way the answers lean, or null below PRACTICE_MIN_N. */
  direction: Direction | null;
  /** Non-empty confidence bands, for the chart (drawn only from PRACTICE_MIN_N). */
  buckets: BucketStat[];
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

/**
 * Local calendar days with at least STREAK_DAY_MIN (1) prediction logged or
 * answered yes/no that day (UI_ROADMAP D2, lowered by D17), in a row except
 * where a saved rest day covers a day that didn't count (step 87). Pass every
 * prediction, open ones included: logging counts. With `now`, today counts
 * once it reaches the minimum, the streak otherwise runs through yesterday,
 * and one with an uncovered day since its last counted day reads 0.
 */
export type ComputeStreak = (predictions: Prediction[], opts?: { now?: Date }) => number;

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
/** Undo a resolution: back to pending, outcome and reflection cleared. */
export type ReopenPrediction = (id: string) => Promise<void>;
/** Set or clear the reflection on an already-resolved prediction. */
export type SetReflection = (id: string, reflection: string | null) => Promise<void>;

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

// ---- DB: daily practice (L2) ----

/** Every stored practice answer, oldest day first. */
export type ListPracticeAnswers = () => Promise<PracticeAnswer[]>;
/** Store one answer; answering the same day and slot again replaces it. */
export type SavePracticeAnswer = (answer: PracticeAnswer) => Promise<void>;
export type ClearPracticeAnswers = () => Promise<void>;
