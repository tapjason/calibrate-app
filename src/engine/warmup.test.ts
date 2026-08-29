import type { WarmupAnswer } from '@/types';

import { scoreWarmup } from './warmup';

const a = (confidence: number, correct: boolean): WarmupAnswer => ({
  confidence,
  correct,
});

/** `n` answers at a fixed confidence, `correct` of them right. */
const answers = (confidence: number, n: number, correct: number): WarmupAnswer[] =>
  Array.from({ length: n }, (_, i) => a(confidence, i < correct));

describe('scoreWarmup', () => {
  it('returns a zeroed, calibrated result for no answers', () => {
    expect(scoreWarmup([])).toEqual({
      answered: 0,
      mean_confidence: 0,
      accuracy: 0,
      mini_score: 0,
      direction: 'calibrated',
      buckets: [],
    });
  });

  it('flags overconfidence: felt 90% sure, right 50% → score 60', () => {
    const r = scoreWarmup(answers(90, 10, 5));
    expect(r.answered).toBe(10);
    expect(r.mean_confidence).toBe(90);
    expect(r.accuracy).toBeCloseTo(0.5, 4);
    expect(r.direction).toBe('overconfident');
    expect(r.mini_score).toBeCloseTo(60, 4); // [80,100] |0.9−0.5| = 0.40
    expect(r.buckets).toHaveLength(1);
    expect(r.buckets[0].low).toBe(80);
  });

  it('flags underconfidence: felt 60% sure, right 90% → score 70', () => {
    const r = scoreWarmup(answers(60, 10, 9));
    expect(r.mean_confidence).toBe(60);
    expect(r.accuracy).toBeCloseTo(0.9, 4);
    expect(r.direction).toBe('underconfident');
    expect(r.mini_score).toBeCloseTo(70, 4); // [60,80) |0.6−0.9| = 0.30
  });

  it('calls a well-matched quiz calibrated with a perfect mini-score', () => {
    const r = scoreWarmup(answers(70, 10, 7));
    expect(r.direction).toBe('calibrated');
    expect(r.mini_score).toBeCloseTo(100, 4);
  });

  it('treats an exactly-threshold gap (0.05) as calibrated, not overconfident', () => {
    // mean 0.75, accuracy 0.70 → gap 0.05, which is not strictly greater.
    const r = scoreWarmup(answers(75, 20, 14));
    expect(r.mean_confidence).toBe(75);
    expect(r.accuracy).toBeCloseTo(0.7, 4);
    expect(r.direction).toBe('calibrated');
  });

  it('scores the mini-chart from bucketed MAE, independent of the overall gap', () => {
    // Two buckets that cancel in the overall gap (→ calibrated verdict) but
    // are each badly miscalibrated, so the bucketed score is low.
    const r = scoreWarmup([...answers(90, 10, 5), ...answers(60, 10, 9)]);
    expect(r.mean_confidence).toBe(75); // (900 + 600) / 20
    expect(r.accuracy).toBeCloseTo(0.7, 4); // (5 + 9) / 20
    expect(r.direction).toBe('calibrated'); // gap 0.05
    expect(r.buckets).toHaveLength(2);
    expect(r.mini_score).toBeCloseTo(65, 4); // mean(0.40, 0.30) = 0.35 → 65
  });

  it('handles a single correct max-confidence answer', () => {
    const r = scoreWarmup([a(100, true)]);
    expect(r.answered).toBe(1);
    expect(r.accuracy).toBe(1);
    expect(r.direction).toBe('calibrated');
    expect(r.mini_score).toBe(100);
  });
});
