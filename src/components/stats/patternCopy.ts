// The words for naming the pattern on Insights (roadmap D37). Pure, so tests
// hold the words to the numbers; the numbers come from the engine.

import { matchedPercent } from '@/components/stats/chartTakeaway';
import { expectedPhrase } from '@/components/stats/expectedPhrase';
import type { CategoryMiss, WeekChange } from '@/store/statsStore';
import { BADGE_META, BADGE_SCORE_BAR } from '@/constants/badges';
import type { BadgeLevel, BucketStat } from '@/types';
import { categoryTitle } from '@/store/categoryStore';

/**
 * "Furthest off: finance. You said about 85%, and 9 of 21 happened." The
 * line Insights shows (roadmap D37); what would have matched and how it fits
 * the badge sit behind a tap on it since D76 (`furthestOffDetail`).
 */
export function furthestOffLine(
  miss: CategoryMiss,
  /** The name to show, when a screen hides it (D62); else its title. */
  name: string = categoryTitle(miss.category),
): string {
  const said = Math.round(miss.mean_stated);
  return `Furthest off: ${name}. You said about ${said}%, and ${miss.happened} of ${miss.resolved} happened.`;
}

/**
 * "About 45% would have matched." and, beside a badge, how the two fit. The
 * number that would have matched is what happened, to the nearest 5, said
 * about the past: a power user wanted it plainly with a number to aim for
 * (blind playtest 2026-11-01, run 3). Behind a tap on the furthest-off line
 * since D76, in the words it had.
 */
export function furthestOffDetail(miss: CategoryMiss, badge?: FurthestOffBadge | null): string {
  const line = `About ${matchedPercent(miss.actual_rate)}% would have matched.`;
  return badge ? `${line} ${badgeClause(badge)}` : line;
}

/** The category's badge and score, as its badge row prints them. */
export interface FurthestOffBadge {
  level: BadgeLevel;
  /** The category score, rounded as the badge row rounds it. */
  score: number;
  giveOrTake: number;
}

/**
 * How the miss and the category's badge fit together (step 173): Insights
 * said "Forecaster in health" and "Furthest off: health" about the same 22
 * walks, and read as contradicting itself (blind playtest 2026-11-12f,
 * finding 5). The pooled gap is already inside the score, which checks each
 * range and is never kinder than pooling (record audit 2026-11-12); the badge
 * only asks the score's low end to clear its bar. Every category here has 20
 * scored answers, so it holds Tracker at least.
 */
function badgeClause({ level, score, giveOrTake }: FurthestOffBadge): string {
  const bar = BADGE_SCORE_BAR[level];
  if (bar !== undefined) {
    return `That gap is already in its score, ${score}, which still clears ${BADGE_META[level].label}'s ${bar} at its low end.`;
  }
  const next = BADGE_SCORE_BAR.forecaster;
  const spread = giveOrTake > 0 ? `, give or take ${giveOrTake},` : ',';
  return `Its score, ${score}${spread} isn't above ${next} at its low end yet, so it's ${BADGE_META.tracker.label}, which counts answers only.`;
}

/**
 * "Up 2 since last week, from 6 answers, within its give-or-take." Nothing free
 * showed change over time; the give-or-take beside it says when a change is
 * no more than luck could make. In How scoring works since D76; Insights'
 * page shows the news alone (`weekChangeShortLine`).
 */
export function weekChangeLine(change: WeekChange, giveOrTake: number): string {
  const delta = change.now - change.before;
  // "given since then": after two months away, seven answers given that
  // morning to old predictions read as a week of new ones (blind playtest
  // 2026-11-09b, finding 4).
  const answers = `${change.answered} ${change.answered === 1 ? 'answer' : 'answers'} given since then`;
  const lead =
    delta > 0
      ? `Up ${delta} since last week, from ${answers}`
      : delta < 0
        ? `Down ${-delta} since last week, from ${answers}`
        : `No change since last week, from ${answers}`;
  return delta !== 0 && Math.abs(delta) <= giveOrTake
    ? `${lead}, within its ${GIVE_OR_TAKE}.`
    : `${lead}.`;
}

// "give-or-take" held whole with word joiners: at 375pt it broke at a hyphen.
const GIVE_OR_TAKE = 'give\u2060-\u2060or\u2060-\u2060take';

/**
 * Whether what happened sits inside the range's grey bar. A range is
 * "calibrated" there, or within 5 points outside it with many answers
 * (direction.ts), and only the first is luck (code review 2026-11-10).
 */
function insideLuck(b: BucketStat): boolean {
  return b.actual_rate >= b.chance_low - 1e-9 && b.actual_rate <= b.chance_high + 1e-9;
}

/** A sample Coach card, written by the app from the person's own record (D37). */
export interface CoachSample {
  figure: string;
  label: string;
  message: string;
}

/**
 * One Coach card on the person's own numbers, for the Plus card (roadmap
 * D37): a power user wouldn't pay for Coach unseen. Written by the app, not
 * the model, from the range used most (with enough answers to read), and
 * labelled as a sample on screen; Coach itself needs Plus and a sign-in.
 */
export function coachSample(buckets: readonly BucketStat[], minN: number): CoachSample | null {
  const solid = buckets.filter((b) => b.total_resolved >= minN);
  if (solid.length === 0) return null;
  const most = solid.reduce((a, b) => (b.total_resolved > a.total_resolved ? b : a));
  const range = `${most.low}–${most.high}%`;
  // Inside luck, the counts against what the numbers expected, not "about as
  // often as you said" (roadmap D57: 12 of 21 at about 66% isn't that).
  const how =
    most.direction === 'overconfident'
      ? `less often than you said: ${most.resolved_yes} of ${most.total_resolved}`
      : most.direction === 'underconfident'
        ? `more often than you said: ${most.resolved_yes} of ${most.total_resolved}`
        : `${most.resolved_yes} of ${most.total_resolved}, against ${expectedPhrase(most.expected_yes)} your numbers expected, ${
            insideLuck(most) ? 'within what luck moves' : 'within 5 points of what you said'
          }`;
  const so =
    most.direction === 'calibrated'
      ? `It's the range you use most, so it holds your rating up.`
      : `It's the range you use most, so it moves your rating most.`;
  return {
    figure: `${Math.round(most.actual_rate * 100)}%`,
    label: `came true at ${range}`,
    message: `Your ${range} calls came true ${how}. ${so}`,
  };
}
