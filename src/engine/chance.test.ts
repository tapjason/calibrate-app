import type { Prediction } from '@/types';

import { computeCalibration, computeRatingRange } from './calibration';
import { bootstrapRange, chanceRange } from './chance';

// Roadmap D4: how far chance alone moves a bucket's dot, and the rating.
describe('chanceRange', () => {
  it('spans the central half of the binomial outcomes, as shares', () => {
    // Binomial(10, 0.75): P(≤6) = .224, P(≤7) = .474, P(≤8) = .756.
    expect(chanceRange(10, 0.75)).toEqual({ low: 0.7, high: 0.8 });
    // Binomial(5, 0.15): P(0) = .444, P(≤1) = .835.
    expect(chanceRange(5, 0.15)).toEqual({ low: 0, high: 0.2 });
    // Binomial(100, 0.5): quartiles at 47 and 53.
    expect(chanceRange(100, 0.5)).toEqual({ low: 0.47, high: 0.53 });
  });

  it('narrows as the count grows', () => {
    const width = (n: number) => {
      const r = chanceRange(n, 0.7);
      return r.high - r.low;
    };
    expect(width(10)).toBeGreaterThan(width(50));
    expect(width(50)).toBeGreaterThan(width(500));
  });

  it("doesn't underflow at large counts", () => {
    const r = chanceRange(5000, 0.5);
    expect(r.low).toBeLessThan(0.5);
    expect(r.high).toBeGreaterThan(0.5);
    expect(r.high - r.low).toBeLessThan(0.02);
  });

  it('handles the edges', () => {
    expect(chanceRange(0, 0.5)).toEqual({ low: 0, high: 0 });
    expect(chanceRange(8, 0)).toEqual({ low: 0, high: 0 });
    expect(chanceRange(8, 1)).toEqual({ low: 1, high: 1 });
  });

  it("is attached to every bucket the engine returns, with the bucket's expected count", () => {
    const resolved = Array.from({ length: 10 }, (_, i) => prediction(75, i < 6));
    const [bucket] = computeCalibration(resolved).buckets;
    expect(bucket.chance_low).toBe(0.7);
    expect(bucket.chance_high).toBe(0.8);
    expect(bucket.expected_yes).toBeCloseTo(7.5);
  });
});

describe('bootstrapRange', () => {
  it('is deterministic for the same input', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(bootstrapRange(items, mean)).toEqual(bootstrapRange(items, mean));
  });

  it('is null with nothing to resample', () => {
    expect(bootstrapRange([], () => 0)).toBeNull();
  });
});

let seq = 0;
function prediction(confidence: number, yes: boolean): Prediction {
  seq += 1;
  return {
    id: `p${seq}`,
    user_id: 'u1',
    title: 't',
    category: 'work',
    confidence,
    created_at: '2026-01-01T00:00:00.000Z',
    due_date: '2026-01-02T00:00:00.000Z',
    status: yes ? 'resolved_yes' : 'resolved_no',
    resolved_at: '2026-01-02T00:00:00.000Z',
    reflection: null,
    integrity_bonus: false,
  };
}

/** n predictions at each of 30/70/90%, about calibrated. */
function record(perBand: number): Prediction[] {
  const out: Prediction[] = [];
  for (const [confidence, rate] of [
    [30, 0.3],
    [70, 0.7],
    [90, 0.9],
  ] as const) {
    for (let i = 0; i < perBand; i++) out.push(prediction(confidence, i < Math.round(perBand * rate)));
  }
  return out;
}

describe('computeRatingRange', () => {
  it('is null with nothing resolved, and ignores skips', () => {
    expect(computeRatingRange([])).toBeNull();
    expect(computeRatingRange([{ ...prediction(70, true), status: 'skipped' }])).toBeNull();
  });

  // A calibrated record scores 100, and every resample scores lower (noise
  // only adds error), so the range is set around the rating itself.
  it('sits around the rating, in whole points, within 0–100', () => {
    const resolved = record(30);
    const range = computeRatingRange(resolved)!;
    const rating = Math.round(computeCalibration(resolved).rating);
    expect(rating).toBe(100);
    expect(range.giveOrTake).toBeGreaterThan(0);
    expect(range).toEqual({
      giveOrTake: range.giveOrTake,
      low: 100 - range.giveOrTake,
      high: 100,
    });
  });

  it('narrows as the record grows', () => {
    const small = computeRatingRange(record(7))!;
    const large = computeRatingRange(record(70))!;
    expect(small.giveOrTake).toBeGreaterThan(large.giveOrTake);
  });

  it('is zero when every resample scores the same', () => {
    const certain = Array.from({ length: 20 }, () => prediction(100, true));
    expect(computeRatingRange(certain)).toEqual({ giveOrTake: 0, low: 100, high: 100 });
  });
});
