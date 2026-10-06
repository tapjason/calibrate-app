import type { BucketStat, Direction } from '@/types';

import { chartTakeaway, naturalFrequency } from './chartTakeaway';

function bucket(
  low: number,
  n: number,
  yes: number,
  direction: Direction,
  error = 0,
): BucketStat {
  return {
    low,
    high: low + 20,
    total_resolved: n,
    resolved_yes: yes,
    stated_confidence_mean: low + 10,
    actual_rate: yes / n,
    bucket_error: error,
    direction,
    chance_low: 0,
    chance_high: 1,
    expected_yes: 0,
  };
}

describe('naturalFrequency', () => {
  it('counts in plain words', () => {
    expect(naturalFrequency(bucket(80, 12, 7, 'overconfident'))).toBe(
      'Of 12 things you called 80–100% likely, 7 happened.',
    );
    expect(naturalFrequency(bucket(60, 3, 3, 'underconfident'))).toBe(
      'Of 3 things you called 60–80% likely, all 3 happened.',
    );
    expect(naturalFrequency(bucket(40, 1, 0, 'calibrated'))).toBe(
      'Of 1 thing you called 40–60% likely, 0 happened.',
    );
  });
});

describe('chartTakeaway', () => {
  it('has no subtitle with nothing resolved', () => {
    expect(chartTakeaway([], true)).toEqual({
      title: 'Your calibration curve',
      subtitle: null,
    });
  });

  // CLAUDE.md: never present a verdict built on noise.
  it('gives no verdict while the rating is provisional', () => {
    const t = chartTakeaway([bucket(80, 15, 5, 'overconfident', 0.5)], true);
    expect(t.title).toBe('Your curve so far');
    expect(t.subtitle).toBe('Of 15 things you called 80–100% likely, 5 happened.');
  });

  it('gives no verdict from thin buckets even once unlocked', () => {
    const t = chartTakeaway(
      [bucket(80, 9, 2, 'overconfident', 0.6), bucket(60, 9, 6, 'calibrated')],
      false,
    );
    expect(t.title).toBe('Your curve so far');
  });

  it('names the worst well-evidenced bucket', () => {
    const t = chartTakeaway(
      [
        bucket(80, 12, 7, 'overconfident', 0.3),
        bucket(40, 10, 8, 'underconfident', 0.2),
        bucket(20, 3, 3, 'underconfident', 0.7), // too thin to headline
      ],
      false,
    );
    expect(t.title).toBe("You're overconfident at 80–100%");
    expect(t.subtitle).toBe('Of 12 things you called 80–100% likely, 7 happened.');
  });

  it('says calibrated when the worst solid bucket is on the line', () => {
    const t = chartTakeaway(
      [bucket(60, 12, 8, 'calibrated', 0.03), bucket(80, 10, 9, 'calibrated', 0.02)],
      false,
    );
    expect(t.title).toBe("You're well calibrated");
  });
});
