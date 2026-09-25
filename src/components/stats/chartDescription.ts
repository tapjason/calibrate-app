import type { BucketStat } from '@/types';

/**
 * What the calibration curve says, in words — the chart's accessibility label.
 * An SVG is silent to VoiceOver, and this chart is the app's core insight, so
 * a screen-reader user gets the same numbers the dots show, range by range.
 *
 * Numbers only, no verdict: the verdict lives in the text around the chart,
 * and restating it here would read it twice.
 */
export function describeCalibrationCurve(buckets: readonly BucketStat[]): string {
  if (buckets.length === 0) {
    return 'Calibration curve. No resolved predictions yet.';
  }
  const ranges = [...buckets]
    .sort((a, b) => a.low - b.low)
    .map((b) => {
      const said = Math.round(b.stated_confidence_mean);
      const right = Math.round(b.actual_rate * 100);
      const n = b.total_resolved;
      return (
        `When you said ${b.low} to ${b.high}%, averaging ${said}%, ` +
        `you were right ${right}% of the time, over ${n} ${n === 1 ? 'prediction' : 'predictions'}.`
      );
    });
  return ['Calibration curve.', ...ranges].join(' ');
}
