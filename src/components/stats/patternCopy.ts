// The words for naming the pattern on Insights (roadmap D37). Pure, so tests
// hold the words to the numbers; the numbers come from the engine.

import type { CategoryMiss, WeekChange } from '@/store/statsStore';
import type { BucketStat } from '@/types';
import { categoryLabel } from '@/store/categoryStore';

/**
 * "Furthest off: finance. You said about 85%, and 8 of 18 happened. About 45%
 * would have matched." The number that would have matched is what happened,
 * to the nearest 5, said about the past: a power user wanted it plainly with
 * a number to aim for (blind playtest 2026-11-01, run 3).
 */
export function furthestOffLine(miss: CategoryMiss): string {
  const said = Math.round(miss.mean_stated);
  const matched = Math.round((miss.actual_rate * 100) / 5) * 5;
  return (
    `Furthest off: ${categoryLabel(miss.category)}. You said about ${said}%, and ${miss.happened} of ` +
    `${miss.resolved} happened. About ${matched}% would have matched.`
  );
}

/**
 * "Up 2 since last week, from 6 answers, within its give-or-take." Nothing free
 * showed change over time; the give-or-take beside it says when a change is
 * no more than luck could make.
 */
export function weekChangeLine(change: WeekChange, giveOrTake: number): string {
  const delta = change.now - change.before;
  const answers = `${change.answered} ${change.answered === 1 ? 'answer' : 'answers'}`;
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
  const how =
    most.direction === 'overconfident'
      ? 'less often than you said'
      : most.direction === 'underconfident'
        ? 'more often than you said'
        : 'about as often as you said';
  const so =
    most.direction === 'calibrated'
      ? `It's the range you use most, so it holds your rating up.`
      : `It's the range you use most, so it moves your rating most.`;
  return {
    figure: `${Math.round(most.actual_rate * 100)}%`,
    label: `came true at ${range}`,
    message: `Your ${range} calls came true ${how}: ${most.resolved_yes} of ${most.total_resolved}. ${so}`,
  };
}
