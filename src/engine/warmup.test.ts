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

  it('calls no lean when ten answers sit inside what luck commonly does', () => {
    // Said 70% on ten, right 6 or 8: the ±5 rule called both a lean, but a
    // perfectly calibrated person lands there about half the time.
    expect(scoreWarmup(answers(70, 10, 6)).direction).toBe('calibrated');
    expect(scoreWarmup(answers(70, 10, 8)).direction).toBe('calibrated');
    expect(scoreWarmup(answers(80, 10, 6)).direction).toBe('calibrated');
  });

  it('names a lean just outside the central 80%', () => {
    // At 70% on ten the central 80% runs 5–9 right.
    expect(scoreWarmup(answers(70, 10, 4)).direction).toBe('overconfident');
    expect(scoreWarmup(answers(70, 10, 10)).direction).toBe('underconfident');
  });

  it('calls any miss at 100% overconfident: luck cannot explain it', () => {
    expect(scoreWarmup(answers(100, 10, 9)).direction).toBe('overconfident');
  });

  it('scores the mini-chart from bucketed MAE, independent of the overall lean', () => {
    // Two buckets that cancel overall (→ no lean) but are each badly
    // miscalibrated, so the bucketed score is low.
    const r = scoreWarmup([...answers(90, 10, 5), ...answers(60, 10, 9)]);
    expect(r.mean_confidence).toBe(75); // (900 + 600) / 20
    expect(r.accuracy).toBeCloseTo(0.7, 4); // (5 + 9) / 20
    expect(r.direction).toBe('calibrated');
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

// The owner, 2026-11-23: "The minimum should never be 50%." The two-choice
// control runs 0–100, and a number under 50 is the stated chance that the pick
// is right, scored as said against whether it was, never flipped.
describe('scoreWarmup — confidences under 50', () => {
  it('reads ten picks at 30% with 3 right as no lean, and a perfect mini-score', () => {
    const r = scoreWarmup(answers(30, 10, 3));
    expect(r.mean_confidence).toBe(30);
    expect(r.accuracy).toBeCloseTo(0.3, 4);
    expect(r.direction).toBe('calibrated');
    expect(r.mini_score).toBeCloseTo(100, 4);
    // Bucketed like a real prediction at 30%: [20,40).
    expect(r.buckets).toHaveLength(1);
    expect(r.buckets[0]).toMatchObject({ low: 20, total_resolved: 10, resolved_yes: 3 });
    expect(r.buckets[0].expected_yes).toBeCloseTo(3, 9);
  });

  it('reads ten picks at 30% with 8 right as underconfident, by the one lean rule', () => {
    const r = scoreWarmup(answers(30, 10, 8));
    expect(r.direction).toBe('underconfident');
    expect(r.mini_score).toBeCloseTo(50, 4); // [20,40) |0.3−0.8| = 0.50
  });

  it('holds the central 80% at 30% on ten: 1 to 5 right is luck', () => {
    expect(scoreWarmup(answers(30, 10, 1)).direction).toBe('calibrated');
    expect(scoreWarmup(answers(30, 10, 5)).direction).toBe('calibrated');
    expect(scoreWarmup(answers(30, 10, 6)).direction).toBe('underconfident');
    // Said 30% and none came right: too sure of picks that were all wrong.
    expect(scoreWarmup(answers(30, 10, 0)).direction).toBe('overconfident');
  });

  it('calls any right pick at 0% underconfident: luck cannot explain it', () => {
    expect(scoreWarmup(answers(0, 10, 1)).direction).toBe('underconfident');
    const none = scoreWarmup(answers(0, 10, 0));
    expect(none.direction).toBe('calibrated');
    expect(none.mini_score).toBe(100);
    expect(none.buckets[0]?.low).toBe(0);
  });

  it('reads a mixed set across 50 in its own ranges', () => {
    // Five at 20% (1 right) and five at 80% (4 right): each range matches.
    const r = scoreWarmup([...answers(20, 5, 1), ...answers(80, 5, 4)]);
    expect(r.mean_confidence).toBe(50);
    expect(r.accuracy).toBeCloseTo(0.5, 4);
    expect(r.direction).toBe('calibrated');
    expect(r.buckets.map((b) => b.low)).toEqual([20, 80]);
    expect(r.mini_score).toBeCloseTo(100, 4);
  });

  it('names a lean on a mixed set when the whole falls outside luck', () => {
    // Five at 40% and five at 60%, all ten right: 50% said, 100% happened.
    const r = scoreWarmup([...answers(40, 5, 5), ...answers(60, 5, 5)]);
    expect(r.mean_confidence).toBe(50);
    expect(r.direction).toBe('underconfident');
    expect(r.buckets.map((b) => b.low)).toEqual([40, 60]);
    expect(r.mini_score).toBeCloseTo(50, 4); // (5×0.6 + 5×0.4) / 10 = 0.5
  });

  it('lets the overall read cancel across 50 while the mini-score does not', () => {
    // The overall lean reads the mean, as it always has (see the 90%/60% case
    // above): five at 10% all right and five at 90% all wrong average out to
    // 50% said and 50% right, while each range is far off.
    const r = scoreWarmup([...answers(10, 5, 5), ...answers(90, 5, 0)]);
    expect(r.mean_confidence).toBe(50);
    expect(r.direction).toBe('calibrated');
    expect(r.mini_score).toBeCloseTo(10, 4); // (5×0.9 + 5×0.9) / 10 = 0.9
  });

  it('still reads a Warm-up kept from before, all at 50–100, exactly as before', () => {
    expect(scoreWarmup(answers(90, 10, 5))).toMatchObject({ direction: 'overconfident' });
    expect(scoreWarmup(answers(50, 10, 5))).toMatchObject({ direction: 'calibrated', mini_score: 100 });
  });
});

// warmup_completed sends the mini score as `score` (src/analytics/events.ts),
// and the server takes a number only when Postgres writes it in at most 24
// characters (supabase/migrations/011, analytics_props_ok). Migration 011's
// note assumed confidences from 50 to 100; this pins that 0–100 changes nothing
// there: with whole-number confidences ten at a time the score is exactly 0 or
// at least about 0.1, so JSON never writes it with an exponent.
describe('scoreWarmup — the mini score still fits the server’s number rule', () => {
  /** mulberry32, so the draw is the same on every run. */
  function prng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
  }

  const fits = (score: number) => {
    const json = JSON.stringify(score);
    return (
      (score === 0 || score >= 1e-6) &&
      score <= 100 &&
      /^\d+(\.\d+)?$/.test(json) &&
      json.length <= 24
    );
  };

  it('holds at the extremes', () => {
    for (const set of [
      answers(0, 10, 10),
      answers(100, 10, 0),
      [...answers(0, 5, 5), ...answers(100, 5, 0)],
      answers(5, 10, 10),
      answers(0, 10, 0),
    ]) {
      expect([set.map((x) => x.confidence).join(','), fits(scoreWarmup(set).mini_score)]).toEqual([
        set.map((x) => x.confidence).join(','),
        true,
      ]);
    }
    expect(scoreWarmup(answers(0, 10, 10)).mini_score).toBe(0);
  });

  it('holds on 20,000 random sets of ten, in steps of 5 and in whole numbers', () => {
    const random = prng(0x5eed);
    let bad: number[] | null = null;
    for (let i = 0; i < 20_000 && bad === null; i += 1) {
      const step = i % 2 === 0 ? 5 : 1;
      const set = Array.from({ length: 10 }, () =>
        a(Math.floor(random() * (100 / step + 1)) * step, random() < 0.5),
      );
      if (!fits(scoreWarmup(set).mini_score)) bad = set.map((x) => x.confidence);
    }
    expect(bad).toBeNull();
  });
});
