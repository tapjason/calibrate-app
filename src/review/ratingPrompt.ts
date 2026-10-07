// The App Store rating prompt (roadmap D15, decided 2026-10-07).
//
// Apple's own prompt only (HIG Ratings and reviews: "Prefer the
// system-provided prompt"), at a natural stopping point after real use: on
// Today once a Resolve sheet closes on a finished run or on the answer that
// unlocked the score. Never in the Warmup, never after a single answer (so a
// Yes is never what earns it), never from a button. The system shows it at
// most three times a year whatever we ask; this keeps us to once per 90 days.
//
// Layer rule: L5. A pure policy plus a thin, fail-silent wrapper around
// expo-store-review, behind a seam for tests. Web has no prompt and no-ops.

import { Platform } from 'react-native';

import type { Prediction } from '@/types';

/** Answers (yes or no) on file before the first ask. */
export const RATING_MIN_ANSWERS = 10;
/** Days since the first prediction before the first ask. */
export const RATING_MIN_DAYS = 7;
/** Days between asks, app-side. */
export const RATING_COOLDOWN_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RatingContext {
  now: Date;
  /** When the first real prediction was logged (the Warmup doesn't count), or null. */
  firstLoggedAt: string | null;
  /** Predictions answered yes or no. Skips don't count. */
  answered: number;
  /** When the prompt was last requested, or null. */
  lastAskedAt: string | null;
}

/** The policy's inputs, from the predictions on file. */
export function ratingContextFor(
  predictions: readonly Prediction[],
  now: Date,
  lastAskedAt: string | null,
): RatingContext {
  let firstLoggedAt: string | null = null;
  let answered = 0;
  for (const p of predictions) {
    if (firstLoggedAt === null || p.created_at < firstLoggedAt) firstLoggedAt = p.created_at;
    if (p.status === 'resolved_yes' || p.status === 'resolved_no') answered += 1;
  }
  return { now, firstLoggedAt, answered, lastAskedAt };
}

/** Whether this moment may ask. Pure, so the rules are tested on their own. */
export function shouldAskForRating({ now, firstLoggedAt, answered, lastAskedAt }: RatingContext): boolean {
  if (answered < RATING_MIN_ANSWERS || !firstLoggedAt) return false;
  const first = Date.parse(firstLoggedAt);
  if (Number.isNaN(first) || now.getTime() - first < RATING_MIN_DAYS * DAY_MS) return false;
  if (lastAskedAt) {
    const last = Date.parse(lastAskedAt);
    if (!Number.isNaN(last) && now.getTime() - last < RATING_COOLDOWN_DAYS * DAY_MS) return false;
  }
  return true;
}

export interface StoreReviewDeps {
  isAvailableAsync(): Promise<boolean>;
  requestReview(): Promise<void>;
}

function defaultDeps(): StoreReviewDeps | null {
  if (Platform.OS === 'web') return null;
  // Lazy: a native module, absent from Jest and the web bundle.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const StoreReview = require('expo-store-review') as typeof import('expo-store-review');
  return {
    isAvailableAsync: () => StoreReview.isAvailableAsync(),
    requestReview: () => StoreReview.requestReview(),
  };
}

let deps: StoreReviewDeps | null | undefined;

/** Test-only: swap the native module (null = unavailable), or restore it. */
export function __setStoreReviewDepsForTests(next: StoreReviewDeps | null | undefined): void {
  deps = next;
}

/**
 * Ask the system to show its rating prompt. True when the request went out
 * (the system still decides whether to show it); false when the prompt isn't
 * available here. Never throws: a rating prompt is never worth an error.
 */
export async function requestRating(): Promise<boolean> {
  try {
    const store = deps === undefined ? defaultDeps() : deps;
    if (!store || !(await store.isAvailableAsync())) return false;
    await store.requestReview();
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[review] rating prompt failed:', e);
    return false;
  }
}
