// Presentation helper: the sentence above the calibration chart.
//
// DESIGN_SYSTEM §7.2: the chart's title is its takeaway ("You’re
// overconfident at 80–100%"), and the subtitle says it in natural frequencies
// ("You called 12 things 80–100% likely. 7 happened.", worded for D76). People
// read a sentence before they read a plot.
//
// A verdict is only drawn from a bucket with enough in it to mean something.
// Direction comes from the engine (`BucketStat.direction`); this file only
// picks which bucket to talk about and words it.

import { MIN_N_BAND, type BucketStat, type Direction } from '@/types';

import { expectedPhrase } from './expectedPhrase';

/**
 * Resolutions a single bucket needs before its direction is named. The
 * overall rating must also be unlocked (MIN_N_OVERALL) before any verdict.
 * One number app-wide (MIN_N_BAND), shared with the engine's correction table.
 */
export const MIN_BUCKET_N_FOR_VERDICT = MIN_N_BAND;

export interface ChartTakeaway {
  title: string;
  subtitle: string | null;
  /**
   * What the title reads, for a mark beside it: a direction, 'both' for a
   * range too sure and one too cautious (no single hue says that), or null
   * for the fallback title, which reads nothing. Today's dot uses it rather
   * than guessing from the words, which gave a two-sided read the green
   * "on the line" dot (code review 2026-11-10).
   */
  lean: Direction | 'both' | null;
}

export function rangeLabel(b: Pick<BucketStat, 'low' | 'high'>): string {
  return `${b.low}–${b.high}%`;
}

/**
 * "Of 12 things you called 80–100% likely, 7 happened", without the stop. The
 * both-sides subtitle's form, which says what would have matched for each
 * side (D57) and keeps its words.
 */
function counted(b: BucketStat): string {
  const n = b.total_resolved;
  const things = n === 1 ? 'thing' : 'things';
  const happened = b.resolved_yes === n && n > 1 ? `all ${n}` : `${b.resolved_yes}`;
  return `Of ${n} ${things} you called ${rangeLabel(b)} likely, ${happened} happened`;
}

/** "You called 12 things 80–100% likely." (D76) */
function called(b: BucketStat): string {
  const n = b.total_resolved;
  return `You called ${n} ${n === 1 ? 'thing' : 'things'} ${rangeLabel(b)} likely.`;
}

/** "7 happened", "All 3 happened", and for one, "It happened" or "It didn’t happen". */
function happenedWords(b: BucketStat): string {
  const n = b.total_resolved;
  if (n === 1) return b.resolved_yes === 1 ? 'It happened' : 'It didn’t happen';
  return b.resolved_yes === n ? `All ${n} happened` : `${b.resolved_yes} happened`;
}

/** "You called 12 things 80–100% likely. 7 happened." (D76) */
export function naturalFrequency(b: BucketStat): string {
  return `${called(b)} ${happenedWords(b)}.`;
}

/**
 * Whether what happened sits within 5 whole points of what was said: the line
 * between "well calibrated" and "no clear lean" for a read inside luck. The
 * recaps' rule since 2026-11-04 ("well calibrated — 66% confident, right 81%"
 * read as a contradiction), and the chart's since D57, one helper for both.
 */
export function closeToSaid(statedPercent: number, happenedPercent: number): boolean {
  return Math.abs(Math.round(statedPercent) - Math.round(happenedPercent)) < 5;
}

/**
 * The number that would have matched: what happened, to the nearest 5, as the
 * category line says it (roadmap D37, `furthestOffLine`).
 */
export function matchedPercent(actualRate: number): number {
  return Math.round((actualRate * 100) / 5) * 5;
}

// No-break spaces hold "about" to its number, as expectedPhrase does.
const matched = (b: BucketStat) => `about\u00A0${matchedPercent(b.actual_rate)}% would have matched`;

function busiest(buckets: readonly BucketStat[]): BucketStat {
  return buckets.reduce((best, b) =>
    b.total_resolved > best.total_resolved ||
    (b.total_resolved === best.total_resolved && b.low > best.low)
      ? b
      : best,
  );
}

/**
 * Both sides at once (roadmap D37): too sure in one range and too cautious
 * in another. Naming only the worst hid that a power user "compresses":
 * 85% calls came true 44% of the time while her 60–80% ones came true more
 * often than she said (blind playtest 2026-11-01, run 3). Each side by the
 * one lean rule (D35), the largest gap on each side. Null unless there are
 * both. Shared with Wrapped, so a recap names both sides too (2026-11-03).
 */
export function bothSides(
  solid: readonly BucketStat[],
): { sure: BucketStat; cautious: BucketStat } | null {
  const over = solid.filter((b) => b.direction === 'overconfident');
  const under = solid.filter((b) => b.direction === 'underconfident');
  if (over.length === 0 || under.length === 0) return null;
  return {
    sure: over.reduce((a, b) => (b.bucket_error > a.bucket_error ? b : a)),
    cautious: under.reduce((a, b) => (b.bucket_error > a.bucket_error ? b : a)),
  };
}

/**
 * The one range a read names when there aren't both sides: the largest gap
 * among the ranges that lean, and only when none leans the largest gap of
 * all, which is then inside its luck range. Taking the largest gap first,
 * whatever its direction, let a 10-answer range inside luck outrank a
 * 60-answer range that leaned, so the title said "well calibrated" over an
 * orange dot (record audit 2026-11-10, the one lean rule, D35). Shared with
 * Wrapped, so no read skips a lean another screen shows; Trends' table sorts
 * the same way in the engine. Needs at least one range: callers return first
 * when there are none.
 */
export function headlineRange<T extends Pick<BucketStat, 'bucket_error' | 'direction'>>(
  solid: readonly T[],
): T {
  const leaning = solid.filter((b) => b.direction !== 'calibrated');
  const pool = leaning.length > 0 ? leaning : solid;
  return pool.reduce((a, b) => (b.bucket_error > a.bucket_error ? b : a));
}

/**
 * What a chart's read says, before it is worded: both sides, the one range
 * the lean rule names, or inside luck everywhere (`close` when every range is
 * within 5 points of what was said). Over ranges with MIN_BUCKET_N_FOR_VERDICT
 * answers or more; null when none has that many. Insights' chart title and
 * practice's headline both word this one read, so neither says "calibrated"
 * over a dot the rule colours (record audit 2026-11-23).
 */
export type ChartRead =
  | { kind: 'both'; sure: BucketStat; cautious: BucketStat }
  | { kind: 'lean'; range: BucketStat; direction: 'overconfident' | 'underconfident' }
  | {
      kind: 'calibrated';
      /** Every range within 5 whole points of what was said. */
      close: boolean;
      /** The range the read is about: the furthest off when not close. */
      shown: BucketStat;
      /** Only one range has enough answers. */
      one: boolean;
    };

export function chartRead(buckets: readonly BucketStat[]): ChartRead | null {
  const solid = buckets.filter((b) => b.total_resolved >= MIN_BUCKET_N_FOR_VERDICT);
  if (solid.length === 0) return null;

  const sides = bothSides(solid);
  if (sides) return { kind: 'both', ...sides };

  // The biggest lean among the well-evidenced buckets is the story; without
  // one, the biggest gap, inside its luck range.
  const worst = headlineRange(solid);
  if (worst.direction !== 'calibrated') {
    return { kind: 'lean', range: worst, direction: worst.direction };
  }

  // Inside luck. "Well calibrated" only within 5 points; a bigger gap luck
  // still allows is "no clear lean", which claims less (roadmap D57: "well
  // calibrated" over 12 of 21 at about 66% read as a contradiction, blind
  // playtest 2026-11-10, runs 6 and 7). The expected count says how far.
  // Every range, not only the widest raw gap: rounded to whole percents, a
  // range with a smaller raw gap can still be 5 apart (record audit
  // 2026-11-10). The subtitle then names the range furthest off in whole
  // percents, the one that made it "no clear lean".
  const gap = (b: BucketStat) =>
    Math.abs(Math.round(b.stated_confidence_mean) - Math.round(b.actual_rate * 100));
  const close = solid.every((b) => closeToSaid(b.stated_confidence_mean, b.actual_rate * 100));
  const shown = close ? worst : solid.reduce((a, b) => (gap(b) > gap(a) ? b : a));
  return { kind: 'calibrated', close, shown, one: solid.length === 1 };
}

/**
 * The chart's read when it has one ("You’re too sure at 80–100%"), or null
 * while the rating is provisional or no band has enough in it. The week's
 * recap sets its own read beside this one (2026-11-03).
 */
export function chartVerdict(
  buckets: readonly BucketStat[],
  ratingProvisional: boolean,
): ChartTakeaway | null {
  if (ratingProvisional || buckets.length === 0) return null;
  const read = chartRead(buckets);
  if (!read) return null;

  if (read.kind === 'both') {
    const { sure, cautious } = read;
    // What would have matched, one figure per side (roadmap D57).
    return {
      title: `You’re too sure at ${rangeLabel(sure)} and too cautious at ${rangeLabel(cautious)}`,
      lean: 'both',
      subtitle:
        `${counted(sure)}; ${matched(sure)}. ` +
        `Of ${cautious.total_resolved} at ${rangeLabel(cautious)}, ${cautious.resolved_yes} happened; ${matched(cautious)}.`,
    };
  }

  if (read.kind === 'calibrated') {
    const { close, shown, one } = read;
    // "Overall" (D62): beside Furthest off naming a category that leans, a
    // bare "no clear lean" read as a contradiction (record audit of step
    // 173). The chart is every category together; a category can still lean.
    return {
      title: close
        ? one
          ? `You’re well calibrated at ${rangeLabel(shown)}`
          : 'You’re well calibrated overall'
        : one
          ? `No clear lean at ${rangeLabel(shown)}`
          : 'No clear lean overall yet',
      // "You called 21 things 60–80% likely. 12 happened, and you’d expect
      // about 14." (D76)
      subtitle: `${called(shown)} ${happenedWords(shown)}, and you’d expect ${expectedPhrase(shown.expected_yes)}.`,
      lean: 'calibrated',
    };
  }

  // A lean, and what would have matched (roadmap D57, the category line's
  // sentence for a range).
  const worst = read.range;
  return {
    title: `You’re ${read.direction} at ${rangeLabel(worst)}`,
    subtitle: `${naturalFrequency(worst)} You said about\u00A0${Math.round(worst.stated_confidence_mean)}%; ${matched(worst)}.`,
    lean: read.direction,
  };
}

export function chartTakeaway(
  buckets: readonly BucketStat[],
  ratingProvisional: boolean,
): ChartTakeaway {
  if (buckets.length === 0) {
    return { title: 'Your calibration curve', subtitle: null, lean: null };
  }
  return (
    chartVerdict(buckets, ratingProvisional) ?? {
      title: 'Your curve so far',
      subtitle: naturalFrequency(busiest(buckets)),
      lean: null,
    }
  );
}
