import { computeCalibrationPoints, type CalibrationPoint } from '@/engine/calibration';
import type { BucketStat, Direction } from '@/types';

import { chartTakeaway, closeToSaid, headlineRange, naturalFrequency } from './chartTakeaway';

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
  // D76: the chart subtitle's voice.
  it('counts in plain words', () => {
    expect(naturalFrequency(bucket(80, 12, 7, 'overconfident'))).toBe(
      'You called 12 things 80–100% likely. 7 happened.',
    );
    expect(naturalFrequency(bucket(60, 3, 3, 'underconfident'))).toBe(
      'You called 3 things 60–80% likely. All 3 happened.',
    );
    expect(naturalFrequency(bucket(40, 1, 0, 'calibrated'))).toBe(
      "You called 1 thing 40–60% likely. It didn't happen.",
    );
    expect(naturalFrequency(bucket(40, 1, 1, 'calibrated'))).toBe(
      'You called 1 thing 40–60% likely. It happened.',
    );
  });
});

describe('chartTakeaway', () => {
  it('has no subtitle with nothing resolved', () => {
    expect(chartTakeaway([], true)).toEqual({
      title: 'Your calibration curve',
      subtitle: null,
      lean: null,
    });
  });

  // CLAUDE.md: never present a verdict built on noise.
  it('gives no verdict while the rating is provisional', () => {
    const t = chartTakeaway([bucket(80, 15, 5, 'overconfident', 0.5)], true);
    expect(t.title).toBe('Your curve so far');
    expect(t.subtitle).toBe('You called 15 things 80–100% likely. 5 happened.');
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
    // Roadmap D57: what would have matched, as the category line says it.
    expect(t.subtitle).toBe(
      'You called 12 things 80–100% likely. 7 happened. You said about\u00A090%; about\u00A060% would have matched.',
    );
  });

  it('says calibrated when the worst solid bucket is on the line', () => {
    const t = chartTakeaway(
      [bucket(60, 12, 8, 'calibrated', 0.03), bucket(80, 10, 9, 'calibrated', 0.02)],
      false,
    );
    expect(t.title).toBe("You're well calibrated overall");
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
      subtitle:
        'Of 20 things you called 80–100% likely, 8 happened; about\u00A040% would have matched. ' +
        'Of 55 at 60–80%, 42 happened; about\u00A075% would have matched.',
      lean: 'both',
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
      subtitle:
        'You called 60 things 80–100% likely. 45 happened. You said about\u00A088%; about\u00A075% would have matched.',
      lean: 'overconfident',
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

// Roadmap D57 (blind playtest 2026-11-10, runs 6 and 7): "You're well
// calibrated" over 12 of 21 at about 66% read as a contradiction. Inside
// luck, "well calibrated" only within 5 points, else "no clear lean", and the
// expected count says how far.
describe('chartTakeaway, inside luck (roadmap D57)', () => {
  const calls = (confidence: number, n: number, yes: number): CalibrationPoint[] =>
    Array.from({ length: n }, (_, i) => ({ confidence, yes: i < yes }));
  const read = (points: CalibrationPoint[]) =>
    chartTakeaway(computeCalibrationPoints(points).buckets, false);

  it('says "no clear lean" for a gap luck allows of 5 points or more', () => {
    const t = read(calls(66, 21, 12)); // 57% against 66%, inside 52–81%
    expect(t).toEqual({
      title: 'No clear lean at 60–80%',
      subtitle: "You called 21 things 60–80% likely. 12 happened, and you'd expect about\u00A014.",
      lean: 'calibrated',
    });
  });

  it('keeps "well calibrated" within 5 points', () => {
    expect(read(calls(70, 20, 14))).toEqual({
      title: "You're well calibrated at 60–80%",
      subtitle: "You called 20 things 60–80% likely. 14 happened, and you'd expect about\u00A014.",
      lean: 'calibrated',
    });
  });

  // D76: the shorter subtitle never claims a lean, nor "well calibrated":
  // the title alone says which (D57).
  it('names no lean and no verdict in the subtitle', () => {
    for (const t of [read(calls(66, 21, 12)), read(calls(70, 20, 14))]) {
      expect(t.subtitle).not.toMatch(/too sure|too cautious|overconfident|underconfident|calibrated/);
    }
  });

  it('speaks for every range when there are several and none leans', () => {
    expect(read([...calls(70, 20, 14), ...calls(88, 20, 18)]).title).toBe("You're well calibrated overall");
    expect(read([...calls(66, 21, 12), ...calls(88, 20, 18)]).title).toBe(
      'No clear lean overall yet',
    );
  });

  // Record audit 2026-11-10: judged on the widest raw gap alone, a range a
  // smaller raw gap away but 5 whole points off still read "well calibrated".
  it('needs every range within 5 whole points to say "well calibrated"', () => {
    const mixed = (a: number, na: number, b: number, nb: number, yes: number) => [
      ...calls(a, na, 0),
      ...calls(b, nb, 0),
    ].map((p, i) => ({ ...p, yes: i < yes }));
    const points = [
      ...mixed(70, 16, 71, 13, 19), // mean 70.45, 19 of 29 (66%): 4 whole points, raw 4.9
      ...mixed(80, 25, 81, 25, 38), // mean 80.5, 38 of 50 (76%): 5 whole points, raw 4.5
    ];
    const { buckets } = computeCalibrationPoints(points);
    expect(buckets.every((b) => b.direction === 'calibrated')).toBe(true);
    expect(chartTakeaway(buckets, false)).toEqual({
      title: 'No clear lean overall yet',
      subtitle: "You called 50 things 80–100% likely. 38 happened, and you'd expect about\u00A040.",
      lean: 'calibrated',
    });
  });

  it('draws the 5-point line on whole percents, as the recaps do', () => {
    expect(closeToSaid(70, 65.4)).toBe(false); // 70 against 65: 5 apart
    expect(closeToSaid(70, 65.6)).toBe(true); // 70 against 66
    expect(closeToSaid(69.6, 65.4)).toBe(false);
  });
});
