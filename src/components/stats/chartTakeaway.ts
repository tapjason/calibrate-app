// Presentation helper: the sentence above the calibration chart.
//
// DESIGN_SYSTEM §7.2: the chart's title is its takeaway ("You're
// overconfident at 80–100%"), and the subtitle says it in natural frequencies
// ("Of 12 things you called 80–100% likely, 7 happened"). People read a
// sentence before they read a plot.
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

/** "Of 12 things you called 80–100% likely, 7 happened", without the stop. */
function counted(b: BucketStat): string {
  const n = b.total_resolved;
  const things = n === 1 ? 'thing' : 'things';
  const happened = b.resolved_yes === n && n > 1 ? `all ${n}` : `${b.resolved_yes}`;
  return `Of ${n} ${things} you called ${rangeLabel(b)} likely, ${happened} happened`;
}

/** "Of 12 things you called 80–100% likely, 7 happened." */
export function naturalFrequency(b: BucketStat): string {
  return `${counted(b)}.`;
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
 * The chart's read when it has one ("You're too sure at 80–100%"), or null
 * while the rating is provisional or no band has enough in it. The week's
 * recap sets its own read beside this one (2026-11-03).
 */
export function chartVerdict(
  buckets: readonly BucketStat[],
  ratingProvisional: boolean,
): ChartTakeaway | null {
  if (ratingProvisional || buckets.length === 0) return null;
  const solid = buckets.filter((b) => b.total_resolved >= MIN_BUCKET_N_FOR_VERDICT);
  if (solid.length === 0) return null;

  const sides = bothSides(solid);
  if (sides) {
    const { sure, cautious } = sides;
    // What would have matched, one figure per side (roadmap D57).
    return {
      title: `You're too sure at ${rangeLabel(sure)} and too cautious at ${rangeLabel(cautious)}`,
      lean: 'both',
      subtitle:
        `${counted(sure)}; ${matched(sure)}. ` +
        `Of ${cautious.total_resolved} at ${rangeLabel(cautious)}, ${cautious.resolved_yes} happened; ${matched(cautious)}.`,
    };
  }

  // The biggest lean among the well-evidenced buckets is the story; without
  // one, the biggest gap, inside its luck range.
  const worst = headlineRange(solid);

  if (worst.direction === 'calibrated') {
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
    const one = solid.length === 1;
    // "Overall" (D62): beside Furthest off naming a category that leans, a
    // bare "no clear lean" read as a contradiction (record audit of step
    // 173). The chart is every category together; a category can still lean.
    return {
      title: close
        ? one
          ? `You're well calibrated at ${rangeLabel(worst)}`
          : "You're well calibrated overall"
        : one
          ? `No clear lean at ${rangeLabel(shown)}`
          : 'No clear lean overall yet',
      subtitle: `${counted(shown)}; your numbers expected ${expectedPhrase(shown.expected_yes)}.`,
      lean: 'calibrated',
    };
  }

  // A lean, and what would have matched (roadmap D57, the category line's
  // sentence for a range).
  return {
    title: `You're ${worst.direction} at ${rangeLabel(worst)}`,
    subtitle: `${naturalFrequency(worst)} You said about\u00A0${Math.round(worst.stated_confidence_mean)}%; ${matched(worst)}.`,
    lean: worst.direction,
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
