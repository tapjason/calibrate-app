import type { BucketStat } from '@/types';

// The engine's tolerance at the band's edges (direction.ts), so a dot exactly
// on an edge reads as inside, as the lean rule treats it.
const EPSILON = 1e-9;

/**
 * Where the dot sits against its grey bar, by the same numbers the bar is
 * drawn from. "Just" when the spoken whole percents tie (a share and an edge
 * a fraction of a point apart, past about 100 answers), so the words never
 * read "75% … between 75 and 88%. 75% is below that range."
 */
function position(b: BucketStat, right: number, lo: number, hi: number): string {
  const below = b.actual_rate < b.chance_low - EPSILON;
  const above = b.actual_rate > b.chance_high + EPSILON;
  const share = `${right}%`;
  if (below) {
    const just = right >= lo ? 'just ' : '';
    return lo === hi ? `${share} is ${just}below that.` : `${share} is ${just}below that range.`;
  }
  if (above) {
    const just = right <= hi ? 'just ' : '';
    return lo === hi ? `${share} is ${just}above that.` : `${share} is ${just}above that range.`;
  }
  return lo === hi ? `${share} matches it.` : `${share} is inside that range.`;
}

/**
 * What the calibration curve says, in words — the chart's accessibility label.
 * An SVG is silent to VoiceOver, and this chart is the app's core insight, so
 * a screen-reader user gets the same numbers the dots show, range by range.
 *
 * Numbers and where each dot sits against its grey bar, no verdict: the
 * verdict lives in the text around the chart, and restating it here would
 * read it twice. Where the dot sits is what a sighted person reads off the
 * plot (and its colour), and without it the label gave the numbers but never
 * said inside, below or above (web check, blind playtest 2026-11-10). Words
 * for position, not "overconfident": a range under 10 answers gets no lean
 * word anywhere (How scoring works).
 */
export function describeCalibrationCurve(buckets: readonly BucketStat[]): string {
  if (buckets.length === 0) {
    return 'Calibration curve. No scored answers yet.';
  }
  const ranges = [...buckets]
    .sort((a, b) => a.low - b.low)
    .map((b) => {
      const said = Math.round(b.stated_confidence_mean);
      const right = Math.round(b.actual_rate * 100);
      const n = b.total_resolved;
      // The grey capsule, in words (roadmap D4).
      const lo = Math.round(b.chance_low * 100);
      const hi = Math.round(b.chance_high * 100);
      const chance =
        lo === hi
          ? `Perfectly calibrated, that would be ${lo}%.`
          : `Perfectly calibrated, 8 times in 10 that would land between ${lo} and ${hi}%.`;
      return (
        `When you said ${b.low} to ${b.high}%, averaging ${said}%, ` +
        `${right}% of them happened, over ${n} ${n === 1 ? 'prediction' : 'predictions'}. ` +
        `${chance} ${position(b, right, lo, hi)}`
      );
    });
  return ['Calibration curve.', ...ranges].join(' ');
}
