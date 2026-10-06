import type { BucketStat } from '@/types';

import { describeCalibrationCurve } from './chartDescription';

const bucket = (over: Partial<BucketStat>): BucketStat => ({
  low: 80,
  high: 100,
  total_resolved: 12,
  resolved_yes: 7,
  stated_confidence_mean: 86.4,
  actual_rate: 7 / 12,
  bucket_error: 0,
  direction: 'overconfident',
  chance_low: 0.75,
  chance_high: 0.92,
  expected_yes: 10.4,
  ...over,
});

describe('describeCalibrationCurve', () => {
  it('says so when there is nothing to plot', () => {
    expect(describeCalibrationCurve([])).toBe(
      'Calibration curve. No resolved predictions yet.',
    );
  });

  it('reads each range low to high, with the numbers the dots show', () => {
    const text = describeCalibrationCurve([
      bucket({}),
      bucket({
        low: 40,
        high: 60,
        total_resolved: 1,
        resolved_yes: 1,
        stated_confidence_mean: 50,
        actual_rate: 1,
        chance_low: 0,
        chance_high: 1,
      }),
    ]);
    // Roadmap D4: each range also says where chance alone would put it.
    expect(text).toBe(
      'Calibration curve. ' +
        'When you said 40 to 60%, averaging 50%, you were right 100% of the time, over 1 prediction. ' +
        'Perfectly calibrated, half the time that would land between 0 and 100%. ' +
        'When you said 80 to 100%, averaging 86%, you were right 58% of the time, over 12 predictions. ' +
        'Perfectly calibrated, half the time that would land between 75 and 92%.',
    );
  });
});
