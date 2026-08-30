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
import type { CoachContext, Category, Prediction, UserStat } from '@/types';

/** Predictions that count: yes/no outcomes only. */
function isYesNo(p: Prediction): boolean {
  return p.status === 'resolved_yes' || p.status === 'resolved_no';
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
      direction: classifyDirection(meanStated, actualRate),
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
    patterns: buildPatterns(yesNo, byCategory),
  };
}

/**
 * The deterministic patterns from L3. `kind` is a stable key the prompt
 * explains; `value` is the only thing the model may cite, and the validator
 * checks every citation against these numbers.
 */
function buildPatterns(
  yesNo: readonly Prediction[],
  byCategory: ReadonlyMap<Category, Prediction[]>,
): CoachContext['patterns'] {
  const patterns: CoachContext['patterns'] = [];

  const weakest = weakestDayOfWeek(yesNo);
  if (weakest) {
    patterns.push({ kind: 'weakest_day_of_week', value: weakest.day });
    patterns.push({ kind: 'weakest_day_score', value: weakest.score });
  }

  for (const [category, list] of byCategory) {
    const drift = categoryDrift(list);
    if (drift) {
      patterns.push({ kind: `drift_${category}`, value: drift.delta });
    }
  }

  return patterns;
}
