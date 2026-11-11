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
      'Calibration curve. No scored answers yet.',
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
        'When you said 40 to 60%, averaging 50%, 100% of them happened, over 1 prediction. ' +
        'Perfectly calibrated, 8 times in 10 that would land between 0 and 100%. ' +
        '100% is inside that range. ' +
        'When you said 80 to 100%, averaging 86%, 58% of them happened, over 12 predictions. ' +
        'Perfectly calibrated, 8 times in 10 that would land between 75 and 92%. ' +
        '58% is below that range.',
    );
  });

  // Web check, blind playtest 2026-11-10: the label gave the numbers but never
  // said where a dot sits against its bar, which the plot and its colour show.
  it('says where each dot sits against its grey bar', () => {
    const above = describeCalibrationCurve([
      bucket({
        low: 60,
        high: 80,
        total_resolved: 30,
        resolved_yes: 29,
        stated_confidence_mean: 70,
        actual_rate: 29 / 30,
        chance_low: 0.6,
        chance_high: 0.8,
      }),
    ]);
    expect(above).toMatch(/97% is above that range\.$/);

    // On an edge counts as inside, as the lean rule treats it.
    const edge = describeCalibrationCurve([bucket({ actual_rate: 0.75 })]);
    expect(edge).toMatch(/75% is inside that range\.$/);

    const exact = describeCalibrationCurve([
      bucket({ chance_low: 0.8, chance_high: 0.8, actual_rate: 0.5 }),
    ]);
    expect(exact).toMatch(/that would be 80%\. 50% is below that\.$/);

    // Past about 100 answers a share can sit a fraction of a point outside
    // the bar and still round to the bar's edge: "just", so the spoken
    // numbers don't contradict the word.
    const tie = describeCalibrationCurve([
      bucket({ total_resolved: 150, actual_rate: 112 / 150, chance_low: 113 / 150, chance_high: 0.88 }),
    ]);
    expect(tie).toMatch(/between 75 and 88%\. 75% is just below that range\.$/);

    const tieAbove = describeCalibrationCurve([
      bucket({ total_resolved: 150, actual_rate: 0.8833, chance_low: 0.75, chance_high: 0.88 }),
    ]);
    expect(tieAbove).toMatch(/88% is just above that range\.$/);

    const tieOneValue = describeCalibrationCurve([
      bucket({ total_resolved: 250, actual_rate: 0.996, chance_low: 1, chance_high: 1 }),
    ]);
    expect(tieOneValue).toMatch(/that would be 100%\. 100% is just below that\.$/);
  });
});
