// Coach context builder (COACH_AGENT.md §4). Assembles the minimal, aggregated
// snapshot the Coach is allowed to see.
//
// Two rules govern this file:
//
//   • The app computes, the model interprets. Every number here comes from the
//     L3 engine or a direct count. The model never gets raw data to derive
//     figures from, because then it would derive them, and they would be wrong.
//
//   • No freetext. Prediction titles and reflections are excluded by default
//     (§4 freetext rule) — reducing what leaves the device is the cheapest
//     safeguard available, so this builder has no code path that can include
//     them.

import { categoryDrift, classifyDirection, weakestDayOfWeek } from '@/engine/patterns';
import { computeCalibrationPoints } from '@/engine/calibration';
import { isSameDayAnswer } from '@/engine/sameDay';
import {
  isBuiltInCategory,
  MIN_N_CATEGORY,
  MIN_N_OVERALL,
  type CoachContext,
  type Category,
  type Prediction,
  type UserStat,
} from '@/types';

import {
  DRIFT_HALF_ANSWERS_PREFIX,
  DRIFT_HALF_MIN_N,
  DRIFT_PREFIX,
  WEEKDAY_ANSWERS_KIND,
  WEEKDAY_KIND,
  WEEKDAY_MIN_N,
  WEEKDAY_SCORE_KIND,
} from './coachPatterns';

/** Predictions that count: yes/no outcomes, not given the day they were logged (D41). */
function isYesNo(p: Prediction): boolean {
  return (p.status === 'resolved_yes' || p.status === 'resolved_no') && !isSameDayAnswer(p);
}

/**
 * Build the Coach's view of the user.
 *
 * Categories below the min-N threshold are still included, with their real
 * `resolved` count. That is deliberate: the Coach needs to see that a category
 * is thin so it can say "keep logging" rather than guess, and the validator
 * enforces that it does. Hiding thin categories would leave the model unable
 * to distinguish "no data" from "not sent".
 */
export function buildCoachContext(
  userStat: UserStat,
  resolved: readonly Prediction[],
): CoachContext {
  const yesNo = resolved.filter(isYesNo);

  const byCategory = new Map<Category, Prediction[]>();
  for (const p of yesNo) {
    // Built-ins only (roadmap D39): a category the person added is named in
    // their own words, and freetext never goes to the model (COACH_AGENT.md).
    if (!isBuiltInCategory(p.category)) continue;
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  const categories: CoachContext['by_category'] = [];
  for (const [category, list] of byCategory) {
    const meanStated = list.reduce((s, p) => s + p.confidence, 0) / list.length;
    const actualRate =
      list.filter((p) => p.status === 'resolved_yes').length / list.length;
    const { rating } = computeCalibrationPoints(
      list.map((p) => ({
        confidence: p.confidence,
        yes: p.status === 'resolved_yes',
      })),
    );

    categories.push({
      category,
      resolved: list.length,
      calibration_score: rating,
      mean_stated_confidence: meanStated,
      actual_rate: actualRate,
      direction: classifyDirection(meanStated, actualRate, list.length),
    });
  }

  // Stable order so the same data produces the same payload — which keeps
  // responses comparable and makes the eval fixtures meaningful.
  categories.sort((a, b) => a.category.localeCompare(b.category));

  return {
    overall: {
      calibration_rating: userStat.calibration_rating,
      total_resolved: userStat.total_resolved,
    },
    by_category: categories,
    patterns: buildPatterns(yesNo, byCategory, userStat.total_resolved),
  };
}

/**
 * The deterministic patterns from L3. `kind` is a stable key the prompt
 * explains (./coachPatterns.ts); the validator checks every citation against
 * these numbers.
 *
 * Only patterns that could ever be cited are sent: no figure from fewer than
 * MIN_N_CATEGORY (20) answers (main session's decision, 2026-11-19). The
 * weekday needs MIN_N_OVERALL scored answers and WEEKDAY_MIN_N (20) on that
 * day (5 on a day until 2026-11-18, then 10); a category's drift needs
 * DRIFT_HALF_MIN_N (20) in each half it compares (4 answers in all until
 * 2026-11-18, then 20 in all, so halves of 10). Below those the figures are
 * provisional, and a figure the model can't see is one it can't cite. Each
 * floor's count travels with its figure so the validators can check it,
 * including for builds that still send thinner figures.
 */
function buildPatterns(
  yesNo: readonly Prediction[],
  byCategory: ReadonlyMap<Category, Prediction[]>,
  totalResolved: number,
): CoachContext['patterns'] {
  const patterns: CoachContext['patterns'] = [];

  const weakest = totalResolved >= MIN_N_OVERALL ? weakestDayOfWeek(yesNo, WEEKDAY_MIN_N) : null;
  if (weakest) {
    patterns.push({ kind: WEEKDAY_KIND, value: weakest.day });
    patterns.push({ kind: WEEKDAY_SCORE_KIND, value: weakest.score });
    patterns.push({ kind: WEEKDAY_ANSWERS_KIND, value: weakest.resolved });
  }

  for (const [category, list] of byCategory) {
    if (list.length < MIN_N_CATEGORY) continue;
    const half = smallerDriftHalf(list);
    if (half < DRIFT_HALF_MIN_N) continue;
    const drift = categoryDrift(list);
    if (drift) {
      patterns.push({ kind: `${DRIFT_PREFIX}${category}`, value: drift.delta });
      patterns.push({ kind: `${DRIFT_HALF_ANSWERS_PREFIX}${category}`, value: half });
    }
  }

  return patterns;
}

/**
 * The answers in the smaller half `categoryDrift` compares: it splits the
 * category's yes/no answers that have a `resolved_at` in time, the older half
 * taking floor(n / 2) and the newer the rest (src/engine/patterns.ts). Counted
 * the same way here; coachContext.test.ts pins the two together.
 */
function smallerDriftHalf(list: readonly Prediction[]): number {
  const n = list.filter(
    (p) => (p.status === 'resolved_yes' || p.status === 'resolved_no') && p.resolved_at,
  ).length;
  return Math.floor(n / 2);
}
