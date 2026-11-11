import { computeCalibrationPoints, type CalibrationPoint } from '@/engine/calibration';
import type { BucketStat, Direction } from '@/types';

import { chartTakeaway, headlineRange, naturalFrequency } from './chartTakeaway';

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
        // Both sides would name both (D37); one side names its worst.
        bucket(40, 10, 5, 'calibrated', 0.04),
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

// Roadmap D37: both sides at once, the compression pattern.
describe('chartTakeaway, both sides', () => {
  it('names a range too sure and a range too cautious together', () => {
    const t = chartTakeaway(
      [
        bucket(60, 55, 42, 'underconfident', 0.08),
        bucket(80, 20, 8, 'overconfident', 0.45),
      ],
      false,
    );
    expect(t).toEqual({
      title: "You're too sure at 80–100% and too cautious at 60–80%",
      subtitle: 'Of 20 things you called 80–100% likely, 8 happened. Of 55 at 60–80%, 42 happened.',
    });
  });
});

// Record audit 2026-11-10: the title took the largest gap among solid ranges
// whatever its direction, so a 10-answer range inside luck outranked a
// 60-answer range that leaned and the title said "well calibrated" over an
// orange dot. Built through the engine, not hand-set directions, so the luck
// rule (D35) decides what leans.
describe('chartTakeaway, a lean outranks a bigger gap inside luck', () => {
  /** `n` answers at `confidence`, the first `yes` of them happened. */
  const calls = (confidence: number, n: number, yes: number): CalibrationPoint[] =>
    Array.from({ length: n }, (_, i) => ({ confidence, yes: i < yes }));

  it('names the range that leans, not the bigger gap inside luck', () => {
    const { buckets } = computeCalibrationPoints([
      ...calls(70, 10, 5), // 50% against 70%: a 20-point gap, inside luck at 10
      ...calls(88, 60, 45), // 75% against 88%: 13 points, outside luck at 60
    ]);
    const mid = buckets.find((b) => b.low === 60)!;
    const top = buckets.find((b) => b.low === 80)!;
    expect(mid.direction).toBe('calibrated');
    expect(top.direction).toBe('overconfident');
    expect(mid.bucket_error).toBeGreaterThan(top.bucket_error);

    expect(chartTakeaway(buckets, false)).toEqual({
      title: "You're overconfident at 80–100%",
      subtitle: 'Of 60 things you called 80–100% likely, 45 happened.',
    });
    expect(headlineRange(buckets.filter((b) => b.total_resolved >= 10))).toBe(top);
  });

  // The rule itself, over many records: a title that names no lean means no
  // range with enough answers leans.
  it('never names no lean while a solid range leans', () => {
    let seed = 20261110;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const leanWords = /overconfident|underconfident|too sure|too cautious/;
    for (let trial = 0; trial < 400; trial++) {
      const points: CalibrationPoint[] = [];
      for (const low of [0, 20, 40, 60, 80]) {
        if (rnd() < 0.4) continue;
        const n = 1 + Math.floor(rnd() * 40);
        const confidence = Math.min(100, low + Math.floor(rnd() * 20));
        const rate = rnd();
        for (let i = 0; i < n; i++) points.push({ confidence, yes: rnd() < rate });
      }
      if (points.length === 0) continue;
      const { buckets } = computeCalibrationPoints(points);
      const t = chartTakeaway(buckets, false);
      const solidLeans = buckets.some(
        (b) => b.total_resolved >= 10 && b.direction !== 'calibrated',
      );
      if (solidLeans) expect(t.title).toMatch(leanWords);
      else expect(t.title).not.toMatch(leanWords);
    }
  });
});
