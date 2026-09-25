// The range-coverage nudge (L3). Pure decision, no I/O and no state.
//
// CLAUDE.md's range-coverage caveat, in full:
//
//   Most users cluster in 60–90% confidence and rarely log things they expect
//   *not* to happen, leaving the low buckets empty and measuring only half the
//   range. [...] the Log screen should periodically nudge users to log a
//   prediction they think is unlikely.
//
// Why this matters more than it sounds: the calibration score is the mean of
// per-bucket errors over NON-EMPTY buckets. A user who only ever logs at 80%+
// gets a score computed from one bucket — a score about one bucket, presented
// as a score about them. `confidenceCoverage` in trends.ts measures that gap
// after the fact; this decides when to do something about it.
//
// The rules, and the reason for each:
//   - Only over the RECENT window. Someone who logged one 15% prediction a
//     year ago and has clustered high ever since still has the habit this
//     nudge exists to break.
//   - Only once there is enough history to call it a habit, not a new account.
//   - Only when the low end is genuinely unused. A single low log switches it
//     off, which also means accepting the nudge silences it immediately —
//     the alternative nags the one user who did what was asked.
//   - At most once a week. This fires on the Log screen, which is the core
//     loop; the core loop must not become a place that lectures you.

import type { Prediction } from '@/types';

/**
 * How many of the most recent logs the decision looks at. Deliberately a
 * window rather than all history — see the note above.
 */
export const NUDGE_WINDOW = 20;

/** Below this many logged predictions, clustering isn't yet a pattern. */
export const NUDGE_MIN_LOGGED = 8;

/**
 * Confidence below this counts as "the low end" — the two bottom buckets,
 * `[0,20)` and `[20,40)`, under the fixed boundaries in CLAUDE.md.
 */
export const LOW_END_MAX = 40;

/** Minimum gap between two nudges. */
export const NUDGE_COOLDOWN_DAYS = 7;

/**
 * What the nudge pre-sets the slider to when accepted. Lands mid-`[20,40)`:
 * low enough to be a real "probably not", high enough to still be a
 * prediction someone would make.
 */
export const NUDGE_CONFIDENCE = 25;

const BUCKET_WIDTH = 20;
const BUCKET_COUNT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The confidence range a user's recent logs actually occupy. */
export interface CoverageGap {
  /** Logged predictions considered — capped at NUDGE_WINDOW. */
  logged: number;
  /** Distinct confidence buckets used within the window, 0–5. */
  buckets_used: number;
  /** True when nothing in the window sits below LOW_END_MAX. */
  low_end_empty: boolean;
}

/** Whether to nudge, and what to show if so. */
export interface CoverageNudgeDecision {
  show: boolean;
  /** Distinct buckets used, carried through so the copy can name it. */
  buckets_used: number;
  /** Confidence to pre-set if the user accepts. */
  suggested_confidence: number;
}

const NO_NUDGE: CoverageNudgeDecision = {
  show: false,
  buckets_used: 0,
  suggested_confidence: NUDGE_CONFIDENCE,
};

function bucketIndex(confidence: number): number {
  return Math.min(BUCKET_COUNT - 1, Math.floor(confidence / BUCKET_WIDTH));
}

/**
 * Summarize the confidence range of a user's most recent logs.
 *
 * Takes predictions in ANY status — pending included. What is being measured
 * is the logging habit, and a prediction logged at 20% counts the moment it is
 * made, not weeks later when it resolves. (`confidenceCoverage` in trends.ts
 * deliberately does the opposite: it describes the data the *score* rests on,
 * which is resolved-only.)
 */
export function coverageGap(predictions: readonly Prediction[]): CoverageGap {
  const window = [...predictions]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, NUDGE_WINDOW);

  const used = new Set<number>();
  let lowEnd = 0;
  for (const p of window) {
    used.add(bucketIndex(p.confidence));
    if (p.confidence < LOW_END_MAX) lowEnd += 1;
  }

  return {
    logged: window.length,
    buckets_used: used.size,
    low_end_empty: lowEnd === 0,
  };
}

/**
 * Decide whether the Log screen should nudge right now.
 *
 * `lastShownAt` is the ISO timestamp of the previous nudge, or null if there
 * has never been one. An unparseable timestamp is treated as "never shown"
 * rather than "recently shown": a corrupt local value should not be able to
 * switch a spec'd behavior off permanently.
 */
export function evaluateCoverageNudge(
  gap: CoverageGap,
  lastShownAt: string | null,
  nowIso: string,
): CoverageNudgeDecision {
  if (gap.logged < NUDGE_MIN_LOGGED) return NO_NUDGE;
  if (!gap.low_end_empty) return NO_NUDGE;
  if (!coolingDown(lastShownAt, nowIso)) {
    return {
      show: true,
      buckets_used: gap.buckets_used,
      suggested_confidence: NUDGE_CONFIDENCE,
    };
  }
  return { ...NO_NUDGE, buckets_used: gap.buckets_used };
}

/** True while the cooldown from `lastShownAt` has not yet elapsed. */
function coolingDown(lastShownAt: string | null, nowIso: string): boolean {
  if (!lastShownAt) return false;
  const last = Date.parse(lastShownAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(last) || !Number.isFinite(now)) return false;
  // A future timestamp (clock moved back, or a synced row from a device set
  // ahead) would otherwise silence the nudge until real time caught up.
  if (last > now) return false;
  return now - last < NUDGE_COOLDOWN_DAYS * DAY_MS;
}
