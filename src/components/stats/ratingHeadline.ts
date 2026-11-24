// Presentation helper: decide what the big "calibration rating" slot shows.
//
// CLAUDE.md is explicit — while the rating is provisional (too few resolutions
// for the number to mean anything) the UI must NOT headline it. Instead it
// shows progress toward the threshold. This keeps that rule in one pure,
// testable place so every screen renders the provisional state the same way.

import { weekChangeLine, weekChangeWithinGiveOrTake } from '@/components/stats/patternCopy';
import { localCount } from '@/components/ui/count';
import type { WeekChange } from '@/store/statsStore';
import { MIN_N_OVERALL, type PerfectReference, type RatingRange, type UserStat } from '@/types';

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
 * "On average you're about 14 points off." The line under Insights' rating
 * (D76, the owner's voice pass, 2026-11-23: the score's explanations off the
 * main page). The same gap as `ratingMeaningLine`, 100 minus the rounded
 * rating; the full sentence, range by range and weighted by count, is one tap
 * away in How scoring works.
 */
export function ratingPointsLine(rating: number): string {
  const gap = Math.max(0, 100 - Math.round(rating));
  if (gap === 0) return 'Your numbers match what happened.';
  return `On average you’re about ${gap} ${gap === 1 ? 'point' : 'points'} off.`;
}

/** Where the rating sits against perfect calibration's middle 80% (D62). */
type PerfectVerdict = 'above' | 'within' | 'within-leans' | 'below' | 'below-leans';

function perfectVerdict(rating: number, ref: PerfectReference, chartLeans: boolean): PerfectVerdict {
  const r = Math.round(rating);
  if (r > ref.high) return 'above';
  if (r >= ref.low) return chartLeans ? 'within-leans' : 'within';
  return chartLeans ? 'below-leans' : 'below';
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
 * In How scoring works since D76; Insights shows `perfectShortLine` at most.
 */
export function perfectLine(
  rating: number,
  ref: PerfectReference,
  scored: number,
  chartLeans = false,
): string {
  const lead =
    `Even perfectly calibrated, ${localCount(scored)} ${scored === 1 ? 'answer' : 'answers'} ` +
    `like yours would typically score about ${ref.typical}, since luck alone moves each range.`;
  switch (perfectVerdict(rating, ref, chartLeans)) {
    case 'above':
      return `${lead} Your score is above that, which luck can do too.`;
    case 'within-leans':
      return `${lead} Your score is within what luck gives, though the chart shows a range that leans.`;
    case 'within':
      return `${lead} At this count, your score can’t be told apart from perfect calibration.`;
    case 'below-leans':
      return `${lead} Your score is further off than luck alone explains.`;
    // Below: the figure stands alone beside "no clear lean", rather than
    // seeming to contradict it.
    case 'below':
      return lead;
  }
}

/**
 * "With 20 answers, that's about as good as anyone can tell." The one piece
 * of `perfectLine` Insights keeps on the page (D76), and only where that line
 * ends "can't be told apart from perfect calibration": inside perfect
 * calibration's middle 80% with no lean on the chart. Every other case is
 * said in How scoring works alone, so the page never sets a verdict about the
 * score beside a lean the chart names, nor one the chart doesn't. Null there.
 */
export function perfectShortLine(
  rating: number,
  ref: PerfectReference,
  scored: number,
  chartLeans = false,
): string | null {
  if (perfectVerdict(rating, ref, chartLeans) !== 'within') return null;
  return `With ${localCount(scored)} ${scored === 1 ? 'answer' : 'answers'}, that’s about as good as anyone can tell.`;
}

/**
 * "Up 4 since last week." The since-last-week line as Insights shows it under
 * the rating (D76): the news only. A change within the rating's give-or-take,
 * or none, reads "About the same as last week." (record audit 2026-11-23: "Up
 * 2" with no give-or-take beside it read as real movement); only a change
 * beyond it is told as up or down. The full sentence, with the answers behind
 * it and whether it's within the give-or-take (`weekChangeLine`), is in How
 * scoring works.
 */
export function weekChangeShortLine(change: WeekChange, giveOrTake: number): string {
  if (weekChangeWithinGiveOrTake(change, giveOrTake)) return 'About the same as last week.';
  const delta = change.now - change.before;
  return delta > 0 ? `Up ${delta} since last week.` : `Down ${-delta} since last week.`;
}

/**
 * The person's own lines at the top of How scoring works when it's opened
 * from a rating (D59; D76 moved them off Insights' page): the points line in
 * full, what perfect calibration scores on the same answers with its verdict,
 * the give-or-take, and since last week in full, in that order. Nothing the
 * page dropped is lost from the app. Empty while the rating is provisional:
 * no number before it unlocks.
 */
export function ratingDetailLines({
  userStat,
  perfect = null,
  chartLeans = false,
  ratingRange = null,
  weekChange = null,
}: {
  userStat: UserStat | null;
  perfect?: PerfectReference | null;
  chartLeans?: boolean;
  ratingRange?: RatingRange | null;
  weekChange?: WeekChange | null;
}): string[] {
  const headline = ratingHeadline(userStat);
  if (!userStat || !headline || headline.provisional) return [];
  const lines = [`Your rating is ${headline.rating}. ${ratingMeaningLine(headline.rating)}`];
  if (perfect) lines.push(perfectLine(headline.rating, perfect, userStat.total_resolved, chartLeans));
  const giveOrTake = ratingRange?.giveOrTake ?? 0;
  if (giveOrTake > 0) {
    lines.push(`Give or take ${giveOrTake} ${giveOrTake === 1 ? 'point' : 'points'} with this many predictions.`);
  }
  if (weekChange) lines.push(weekChangeLine(weekChange, giveOrTake));
  return lines;
}

/** Whether a chart read names a lean, for `perfectLine`. */
export function chartNamesLean(lean: string | null | undefined): boolean {
  return lean === 'overconfident' || lean === 'underconfident' || lean === 'both';
}

/**
 * "Badges need 20 scored answers in one category. Your 73 are spread over 13,
 * so none is there yet." (step 173; worded for D76). A bettor with 73 answers
 * over 13 categories had no badge and no word why (blind playtest 2026-11-12f,
 * finding 6). Only when the total would have earned one in a single category;
 * counts only categories with a scored answer, hidden ones included, so they
 * add up to the "scored" total. Never fewer than 2 categories here.
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
    `Badges need ${firstBadgeAt} scored answers in one category. Your ${localCount(totalScored)} ` +
    `are spread over ${used.length}, so none is there yet.`
  );
}
