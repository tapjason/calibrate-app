import type { Prediction } from '@/types';

import { computeCalibration, evaluateBadge } from './calibration';

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

  it('returns rating=100 when every bucket matches its outcome rate exactly', () => {
    // 10 predictions at 100% confidence, all yes → top bucket, error=0
    const preds = Array.from({ length: 10 }, (_, i) =>
      p({ id: `p${i}`, confidence: 100, status: 'resolved_yes' }),
    );
    const r = computeCalibration(preds);
    expect(r.rating).toBe(100);
    expect(r.buckets).toHaveLength(1);
    expect(r.buckets[0].bucket_error).toBe(0);
    expect(r.buckets[0].actual_rate).toBe(1);
  });

  it('penalizes overconfidence quantitatively', () => {
    // 10 at conf=90, half yes → stated=0.9, actual=0.5, err=0.16 → rating=84
    const preds = Array.from({ length: 10 }, (_, i) =>
      p({
        id: `p${i}`,
        confidence: 90,
        status: i < 5 ? 'resolved_yes' : 'resolved_no',
      }),
    );
    const r = computeCalibration(preds);
    expect(r.buckets).toHaveLength(1);
    expect(r.buckets[0].bucket_error).toBeCloseTo(0.16, 4);
    expect(r.rating).toBeCloseTo(84, 4);
  });

  it('penalizes underconfidence symmetrically to overconfidence', () => {
    // 10 at conf=30, 7 resolved yes → stated=0.3, actual=0.7, err=0.16 → rating=84
    const preds = Array.from({ length: 10 }, (_, i) =>
      p({
        id: `p${i}`,
        confidence: 30,
        status: i < 7 ? 'resolved_yes' : 'resolved_no',
      }),
    );
    const r = computeCalibration(preds);
    expect(r.buckets).toHaveLength(1);
    expect(r.buckets[0].bucket_error).toBeCloseTo(0.16, 4);
    expect(r.rating).toBeCloseTo(84, 4);
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

describe('evaluateBadge', () => {
  it('returns guesser by default (below all thresholds)', () => {
    expect(evaluateBadge(0, 0)).toBe('guesser');
    expect(evaluateBadge(4, 50)).toBe('guesser');
    expect(evaluateBadge(19, 70)).toBe('guesser');
  });

  it('returns tracker when ≥20 resolved but score ≤70', () => {
    expect(evaluateBadge(20, 0)).toBe('tracker');
    expect(evaluateBadge(99, 70)).toBe('tracker');
  });

  it('returns forecaster when score > 70', () => {
    expect(evaluateBadge(20, 71)).toBe('forecaster');
    expect(evaluateBadge(1, 85)).toBe('forecaster');
  });

  it('returns sharp when score > 85', () => {
    expect(evaluateBadge(50, 86)).toBe('sharp');
    expect(evaluateBadge(50, 90)).toBe('sharp');
  });

  it('returns oracle only when score > 90 AND ≥100 resolved', () => {
    expect(evaluateBadge(100, 91)).toBe('oracle');
    expect(evaluateBadge(500, 99)).toBe('oracle');
  });

  it('returns sharp (not oracle) when score > 90 but <100 resolved', () => {
    expect(evaluateBadge(99, 95)).toBe('sharp');
    expect(evaluateBadge(50, 100)).toBe('sharp');
  });
});
