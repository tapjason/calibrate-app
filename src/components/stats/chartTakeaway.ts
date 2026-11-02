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

import { MIN_N_BAND, type BucketStat } from '@/types';

/**
 * Resolutions a single bucket needs before its direction is named. The
 * overall rating must also be unlocked (MIN_N_OVERALL) before any verdict.
 * One number app-wide (MIN_N_BAND), shared with the engine's correction table.
 */
export const MIN_BUCKET_N_FOR_VERDICT = MIN_N_BAND;

export interface ChartTakeaway {
  title: string;
  subtitle: string | null;
}

export function rangeLabel(b: Pick<BucketStat, 'low' | 'high'>): string {
  return `${b.low}–${b.high}%`;
}

/** "Of 12 things you called 80–100% likely, 7 happened." */
export function naturalFrequency(b: BucketStat): string {
  const n = b.total_resolved;
  const things = n === 1 ? 'thing' : 'things';
  const happened = b.resolved_yes === n && n > 1 ? `all ${n}` : `${b.resolved_yes}`;
  return `Of ${n} ${things} you called ${rangeLabel(b)} likely, ${happened} happened.`;
}

function busiest(buckets: readonly BucketStat[]): BucketStat {
  return buckets.reduce((best, b) =>
    b.total_resolved > best.total_resolved ||
    (b.total_resolved === best.total_resolved && b.low > best.low)
      ? b
      : best,
  );
}

export function chartTakeaway(
  buckets: readonly BucketStat[],
  ratingProvisional: boolean,
): ChartTakeaway {
  if (buckets.length === 0) {
    return { title: 'Your calibration curve', subtitle: null };
  }

  const fallback = (): ChartTakeaway => ({
    title: 'Your curve so far',
    subtitle: naturalFrequency(busiest(buckets)),
  });

  if (ratingProvisional) return fallback();

  const solid = buckets.filter((b) => b.total_resolved >= MIN_BUCKET_N_FOR_VERDICT);
  if (solid.length === 0) return fallback();

  // Both sides at once (roadmap D37): too sure in one range and too cautious
  // in another. Naming only the worst hid that a power user "compresses":
  // 85% calls came true 44% of the time while her 60–80% ones came true more
  // often than she said (blind playtest 2026-11-01, run 3). Each side by the
  // one lean rule (D35), the surest range and the largest gap first.
  const over = solid.filter((b) => b.direction === 'overconfident');
  const under = solid.filter((b) => b.direction === 'underconfident');
  if (over.length > 0 && under.length > 0) {
    const sure = over.reduce((a, b) => (b.bucket_error > a.bucket_error ? b : a));
    const cautious = under.reduce((a, b) => (b.bucket_error > a.bucket_error ? b : a));
    return {
      title: `You're too sure at ${rangeLabel(sure)} and too cautious at ${rangeLabel(cautious)}`,
      subtitle: `${naturalFrequency(sure)} Of ${cautious.total_resolved} at ${rangeLabel(cautious)}, ${cautious.resolved_yes} happened.`,
    };
  }

  // The biggest miss among the well-evidenced buckets is the story.
  const worst = solid.reduce((a, b) => (b.bucket_error > a.bucket_error ? b : a));

  if (worst.direction === 'calibrated') {
    return {
      title:
        solid.length > 1
          ? "You're well calibrated"
          : `You're well calibrated at ${rangeLabel(worst)}`,
      subtitle: naturalFrequency(worst),
    };
  }

  return {
    title: `You're ${worst.direction} at ${rangeLabel(worst)}`,
    subtitle: naturalFrequency(worst),
  };
}
