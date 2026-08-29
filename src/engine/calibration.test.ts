import type { Prediction } from '@/types';

import {
  computeCalibration,
  evaluateBadge,
  isRatingProvisional,
  isScoreProvisional,
  nextBadge,
} from './calibration';

const p = (overrides: Partial<Prediction> = {}): Prediction => ({
  id: 'p',
  user_id: 'u1',
  title: 't',
  category: 'work',
  confidence: 50,
  created_at: '2026-01-01T00:00:00.000Z',
  due_date: '2026-02-01T00:00:00.000Z',
  status: 'resolved_yes',
  resolved_at: '2026-02-01T00:00:00.000Z',
  reflection: null,
  integrity_bonus: false,
  ...overrides,
});

/** `total` resolved predictions at a fixed confidence, `yes` of them resolved_yes. */
const bucketPreds = (confidence: number, total: number, yes: number): Prediction[] =>
  Array.from({ length: total }, (_, i) =>
    p({
      id: `c${confidence}-${i}`,
      confidence,
      status: i < yes ? 'resolved_yes' : 'resolved_no',
    }),
  );

describe('computeCalibration', () => {
  it('returns rating=0 and empty buckets for no input', () => {
    expect(computeCalibration([])).toEqual({ rating: 0, buckets: [] });
  });

  it('ignores predictions that are not resolved yes/no', () => {
    const r = computeCalibration([
      p({ id: 'a', status: 'pending', resolved_at: null }),
      p({ id: 'b', status: 'skipped' }),
    ]);
    expect(r.buckets).toEqual([]);
    expect(r.rating).toBe(0);
  });

  // The worked-example table in CLAUDE.md is a required fixture set. Each single
  // bucket case: stated_mean vs actual_rate → |diff| → rating = 100 − |diff|×100.
  describe('CLAUDE.md worked examples (mean absolute error)', () => {
    it.each([
      // label,                       conf, total, yes, statedMean, actualRate, error, rating
      ['perfect',                       90,    10,   9,       0.9,       0.9,    0.0,   100],
      ['slightly off',                  90,    20,  17,       0.9,      0.85,   0.05,    95],
      ['moderately overconfident',      80,    10,   6,       0.8,       0.6,    0.2,    80],
      ['badly overconfident',           90,    10,   5,       0.9,       0.5,    0.4,    60],
      ['underconfident',                60,    20,  17,       0.6,      0.85,   0.25,    75],
    ])(
      '%s → rating %d',
      (_label, conf, total, yes, statedMean, actualRate, error, rating) => {
        const r = computeCalibration(bucketPreds(conf, total, yes));
        expect(r.buckets).toHaveLength(1);
        expect(r.buckets[0].stated_confidence_mean).toBeCloseTo(statedMean * 100, 4);
        expect(r.buckets[0].actual_rate).toBeCloseTo(actualRate, 4);
        expect(r.buckets[0].bucket_error).toBeCloseTo(error, 4);
        expect(r.rating).toBeCloseTo(rating, 4);
      },
    );

    it('averages bucket errors 0.05, 0.20, 0.35 → mean 0.20 → rating 80', () => {
      const r = computeCalibration([
        ...bucketPreds(90, 20, 17), // [80,100]  stated 0.9 actual 0.85 err 0.05
        ...bucketPreds(60, 10, 4), //  [60,80)   stated 0.6 actual 0.40 err 0.20
        ...bucketPreds(50, 20, 17), // [40,60)   stated 0.5 actual 0.85 err 0.35
      ]);
      expect(r.buckets).toHaveLength(3);
      expect(r.rating).toBeCloseTo(80, 4);
    });
  });

  it('penalizes over- and under-confidence symmetrically', () => {
    // conf=90 half yes: |0.9−0.5| = 0.40 → 60. conf=10 with 0.6 rate: |0.1−0.6| = 0.50.
    const over = computeCalibration(bucketPreds(90, 10, 5));
    const under = computeCalibration(bucketPreds(10, 10, 6));
    expect(over.rating).toBeCloseTo(60, 4);
    expect(under.rating).toBeCloseTo(50, 4);
  });

  it('clamps rating to [0,100] and never goes negative', () => {
    // conf=100 all no: |1.0−0.0| = 1.0 → rating exactly 0, not below.
    const r = computeCalibration(bucketPreds(100, 5, 0));
    expect(r.rating).toBe(0);
  });

  it('routes confidences into the right buckets at boundaries', () => {
    const preds = [
      p({ id: '0', confidence: 0, status: 'resolved_no' }), // [0,20)
      p({ id: '19', confidence: 19, status: 'resolved_no' }), // [0,20)
      p({ id: '20', confidence: 20, status: 'resolved_no' }), // [20,40)
      p({ id: '50', confidence: 50, status: 'resolved_yes' }), // [40,60)
      p({ id: '80', confidence: 80, status: 'resolved_yes' }), // [80,100]
      p({ id: '100', confidence: 100, status: 'resolved_yes' }), // [80,100]
    ];
    const r = computeCalibration(preds);
    expect(r.buckets.map((b) => b.low)).toEqual([0, 20, 40, 80]);

    const top = r.buckets.find((b) => b.low === 80)!;
    expect(top.total_resolved).toBe(2);
    expect(top.stated_confidence_mean).toBe(90);
    expect(top.actual_rate).toBe(1);
  });

  it('returns buckets sorted by low bound ascending', () => {
    const preds = [
      p({ id: 'a', confidence: 90, status: 'resolved_yes' }),
      p({ id: 'b', confidence: 10, status: 'resolved_no' }),
      p({ id: 'c', confidence: 50, status: 'resolved_yes' }),
    ];
    const lows = computeCalibration(preds).buckets.map((b) => b.low);
    expect(lows).toEqual([...lows].sort((a, b) => a - b));
  });
});

describe('provisional gating', () => {
  it('flags the overall rating provisional below MIN_N_OVERALL (20)', () => {
    expect(isRatingProvisional(0)).toBe(true);
    expect(isRatingProvisional(19)).toBe(true);
    expect(isRatingProvisional(20)).toBe(false);
    expect(isRatingProvisional(50)).toBe(false);
  });

  it('flags a category score provisional below MIN_N_CATEGORY (15)', () => {
    expect(isScoreProvisional(0)).toBe(true);
    expect(isScoreProvisional(14)).toBe(true);
    expect(isScoreProvisional(15)).toBe(false);
    expect(isScoreProvisional(40)).toBe(false);
  });
});

describe('evaluateBadge', () => {
  it('returns guesser below every threshold', () => {
    expect(evaluateBadge(0, 0)).toBe('guesser');
    expect(evaluateBadge(4, 50)).toBe('guesser');
    expect(evaluateBadge(19, 95)).toBe('guesser');
  });

  it('never awards a badge above guesser on too few resolutions (min-N)', () => {
    // High score but under the resolution gates → capped at guesser/tracker.
    expect(evaluateBadge(10, 100)).toBe('guesser'); // <20 resolved
    expect(evaluateBadge(49, 100)).toBe('forecaster'); // ≥20 but <50 → not sharp
  });

  it('returns tracker when ≥20 resolved but score ≤70', () => {
    expect(evaluateBadge(20, 0)).toBe('tracker');
    expect(evaluateBadge(30, 70)).toBe('tracker'); // 70 is not > 70
    expect(evaluateBadge(99, 70)).toBe('tracker');
  });

  it('returns forecaster when score > 70 AND ≥20 resolved', () => {
    expect(evaluateBadge(20, 71)).toBe('forecaster');
    expect(evaluateBadge(30, 86)).toBe('forecaster'); // score high, but <50 resolved
  });

  it('returns sharp when score > 85 AND ≥50 resolved', () => {
    expect(evaluateBadge(50, 86)).toBe('sharp');
    expect(evaluateBadge(99, 95)).toBe('sharp'); // <100 resolved → not oracle
  });

  it('returns oracle only when score > 90 AND ≥100 resolved', () => {
    expect(evaluateBadge(100, 91)).toBe('oracle');
    expect(evaluateBadge(500, 99)).toBe('oracle');
    expect(evaluateBadge(100, 90)).toBe('sharp'); // 90 is not > 90
  });
});

describe('nextBadge', () => {
  it('points a guesser at tracker with its resolution threshold', () => {
    expect(nextBadge(0, 0)).toEqual({
      badge: 'tracker',
      needResolved: 20,
      needScore: null,
    });
  });

  it('points a tracker at forecaster with both thresholds', () => {
    expect(nextBadge(25, 50)).toEqual({
      badge: 'forecaster',
      needResolved: 20,
      needScore: 70,
    });
  });

  it('points a forecaster at sharp with both thresholds', () => {
    expect(nextBadge(30, 75)).toEqual({
      badge: 'sharp',
      needResolved: 50,
      needScore: 85,
    });
  });

  it('points a sharp at oracle with both thresholds', () => {
    expect(nextBadge(60, 88)).toEqual({
      badge: 'oracle',
      needResolved: 100,
      needScore: 90,
    });
  });

  it('returns null when the user is already an oracle', () => {
    expect(nextBadge(120, 95)).toBeNull();
  });

  it('a high score with too few resolutions is still a guesser aiming at tracker', () => {
    // Under min-N gates, few resolutions can't skip ahead — next is tracker.
    expect(nextBadge(5, 95)?.badge).toBe('tracker');
  });
});
