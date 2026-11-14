// Presentation helper: decide what the big "calibration rating" slot shows.
//
// CLAUDE.md is explicit — while the rating is provisional (too few resolutions
// for the number to mean anything) the UI must NOT headline it. Instead it
// shows progress toward the threshold. This keeps that rule in one pure,
// testable place so every screen renders the provisional state the same way.

import { localCount } from '@/components/ui/count';
import { MIN_N_OVERALL, type PerfectReference, type UserStat } from '@/types';

export type RatingHeadline =
  | { provisional: false; rating: number }
  | { provisional: true; remaining: number };

/**
 * `null`   → no stats yet (render a placeholder).
 * provisional → `remaining` resolutions still needed before the score unlocks.
 * else     → `rating`, the rounded headline number.
 */
export function ratingHeadline(userStat: UserStat | null): RatingHeadline | null {
  if (!userStat) return null;
  if (userStat.rating_is_provisional) {
    return {
      provisional: true,
      remaining: Math.max(0, MIN_N_OVERALL - userStat.total_resolved),
    };
  }
  return { provisional: false, rating: Math.round(userStat.calibration_rating) };
}

/**
 * What the rating means, in points (step 173): "is 86 good?" was answered
 * nowhere plainly (blind playtest 2026-11-12f, finding 1). 100 minus the
 * rating is exactly the count-weighted average gap, range by range, between
 * what was said and how often it happened (CLAUDE.md's formula), taken from
 * the rounded rating on screen so the two add up to 100. Said as an average
 * over ranges, not each answer's miss, which is far bigger (record audit
 * 2026-11-12). "Range" everywhere since D62's one word for it (it was "band"
 * in How scoring works).
 */
export function ratingMeaningLine(rating: number): string {
  const gap = Math.max(0, 100 - Math.round(rating));
  const lead = 'Range by range, what you said';
  if (gap === 0) return `${lead} matched how often those things happened.`;
  return (
    `${lead} averaged about ${gap} ${gap === 1 ? 'point' : 'points'} away from how often ` +
    'those things happened, each range counting by how many answers it holds.'
  );
}

/**
 * What perfect calibration would score on the same answers, and where the
 * rating sits against it (D62, blind playtest 2026-11-13d, finding 1): a
 * statistician saw his 85 was about what a perfect forecaster gets from 20
 * answers, while the points line put the whole gap on him. The verdict is
 * about the score, and never contradicts the chart's lean read (record audit
 * of step 178): the two use different tests, the score against the middle
 * 80% of simulated perfect scores, each range by the lean rule (D35).
 * `chartLeans`: whether the chart names a range too sure or too cautious.
 */
export function perfectLine(
  rating: number,
  ref: PerfectReference,
  scored: number,
  chartLeans = false,
): string {
  const r = Math.round(rating);
  const lead =
    `Even perfectly calibrated, ${localCount(scored)} ${scored === 1 ? 'answer' : 'answers'} ` +
    `like yours would typically score about ${ref.typical}, since luck alone moves each range.`;
  if (r > ref.high) return `${lead} Your score is above that, which luck can do too.`;
  if (r >= ref.low) {
    return chartLeans
      ? `${lead} Your score is within what luck gives, though the chart shows a range that leans.`
      : `${lead} At this count, your score can’t be told apart from perfect calibration.`;
  }
  // Below: said only when the chart names a lean too; otherwise the figure
  // stands alone beside "no clear lean", rather than seeming to contradict it.
  return chartLeans ? `${lead} Your score is further off than luck alone explains.` : lead;
}

/** Whether a chart read names a lean, for `perfectLine`. */
export function chartNamesLean(lean: string | null | undefined): boolean {
  return lean === 'overconfident' || lean === 'underconfident' || lean === 'both';
}

/**
 * "Badges are per category, at 20 scored answers in one. Your 73 scored
 * answers are spread over 13 categories, so none has 20 yet." (step 173). A
 * bettor with 73 answers over 13 categories had no badge and no word why
 * (blind playtest 2026-11-12f, finding 6). Only when the total would have
 * earned one in a single category; counts only categories with a scored
 * answer, hidden ones included, so they add up to the "scored" total.
 */
export function spreadThinLine(
  totalScored: number,
  scoredByCategory: readonly number[],
  firstBadgeAt: number,
): string | null {
  const used = scoredByCategory.filter((n) => n > 0);
  if (totalScored < firstBadgeAt || used.length < 2) return null;
  if (used.some((n) => n >= firstBadgeAt)) return null;
  return (
    `Badges are per category, at ${firstBadgeAt} scored answers in one. Your ${localCount(totalScored)} ` +
    `scored answers are spread over ${used.length} categories, so none has ${firstBadgeAt} yet.`
  );
}
