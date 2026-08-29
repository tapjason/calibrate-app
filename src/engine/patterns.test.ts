import type { Prediction } from '@/types';

import {
  categoryDrift,
  classifyDirection,
  dayOfWeekAccuracy,
  weakestDayOfWeek,
} from './patterns';

const p = (overrides: Partial<Prediction> = {}): Prediction => ({
  id: 'p',
  user_id: 'u1',
  title: 't',
  category: 'work',
  confidence: 90,
  created_at: '2026-01-01T00:00:00.000Z',
  due_date: '2026-02-01T00:00:00.000Z',
  status: 'resolved_yes',
  resolved_at: '2026-02-01T00:00:00.000Z',
  reflection: null,
  integrity_bonus: false,
  ...overrides,
});

describe('classifyDirection', () => {
  it('calls a large positive gap overconfident', () => {
    expect(classifyDirection(90, 0.5)).toBe('overconfident');
  });

  it('calls a large negative gap underconfident', () => {
    expect(classifyDirection(60, 0.9)).toBe('underconfident');
  });

  it('calls a matched confidence/rate calibrated', () => {
    expect(classifyDirection(70, 0.7)).toBe('calibrated');
  });

  it('treats an exactly-threshold gap (0.05) as calibrated (float-safe)', () => {
    // 0.75 − 0.7 = 0.05000000000000004; must not tip into a verdict.
    expect(classifyDirection(75, 0.7)).toBe('calibrated');
  });
});

describe('dayOfWeekAccuracy', () => {
  // 2026-02-02 is a Monday (UTC). getUTCDay: Sun=0 … Mon=1.
  const MON = '2026-02-02T12:00:00.000Z';
  const TUE = '2026-02-03T12:00:00.000Z';

  it('ignores non-yes/no and rows without resolved_at', () => {
    const stats = dayOfWeekAccuracy([
      p({ status: 'pending', resolved_at: null }),
      p({ status: 'skipped', resolved_at: MON }),
    ]);
    expect(stats).toEqual([]);
  });

  it('groups by UTC weekday with hit rate and calibration score', () => {
    const stats = dayOfWeekAccuracy([
      p({ id: 'm1', resolved_at: MON, confidence: 90, status: 'resolved_yes' }),
      p({ id: 'm2', resolved_at: MON, confidence: 90, status: 'resolved_no' }),
      p({ id: 't1', resolved_at: TUE, confidence: 90, status: 'resolved_yes' }),
    ]);

    const mon = stats.find((s) => s.day === 1)!;
    expect(mon.resolved).toBe(2);
    expect(mon.hit_rate).toBe(0.5);
    expect(mon.score).toBeCloseTo(60, 4); // |0.9 − 0.5| = 0.40 → 60

    const tue = stats.find((s) => s.day === 2)!;
    expect(tue.hit_rate).toBe(1);
    expect(tue.score).toBeCloseTo(90, 4); // stated 0.9 vs actual 1.0 → |0.1| → 90
  });

  it('sorts days Sunday→Saturday', () => {
    const stats = dayOfWeekAccuracy([
      p({ id: 'a', resolved_at: TUE }),
      p({ id: 'b', resolved_at: MON }),
    ]);
    expect(stats.map((s) => s.day)).toEqual([1, 2]);
  });
});

describe('weakestDayOfWeek', () => {
  const MON = '2026-02-02T12:00:00.000Z'; // Monday
  const TUE = '2026-02-03T12:00:00.000Z'; // Tuesday

  it('returns null when no weekday clears minResolved', () => {
    expect(weakestDayOfWeek([p({ resolved_at: MON })], 5)).toBeNull();
  });

  it('picks the lowest-scoring eligible weekday', () => {
    const preds = [
      // Monday: 6 preds @90, 3 yes → overconfident, score 60
      ...Array.from({ length: 6 }, (_, i) =>
        p({
          id: `m${i}`,
          resolved_at: MON,
          confidence: 90,
          status: i < 3 ? 'resolved_yes' : 'resolved_no',
        }),
      ),
      // Tuesday: 6 preds @90, all yes → score 100
      ...Array.from({ length: 6 }, (_, i) =>
        p({ id: `t${i}`, resolved_at: TUE, confidence: 90, status: 'resolved_yes' }),
      ),
    ];
    const worst = weakestDayOfWeek(preds, 5);
    expect(worst?.day).toBe(1); // Monday
    expect(worst?.score).toBeCloseTo(60, 4);
  });
});

describe('categoryDrift', () => {
  it('returns null below the minimum resolution count', () => {
    expect(categoryDrift([p({ id: 'a' }), p({ id: 'b' }), p({ id: 'c' })])).toBeNull();
  });

  it('reports improvement when the recent half is better calibrated', () => {
    // Older half: 2 @90 with 1 yes → |0.9−0.5| → score 60.
    // Newer half: 2 @90 all yes → |0.9−1.0| → score 90.
    const drift = categoryDrift([
      p({ id: 'o1', resolved_at: '2026-01-01T00:00:00.000Z', confidence: 90, status: 'resolved_yes' }),
      p({ id: 'o2', resolved_at: '2026-01-02T00:00:00.000Z', confidence: 90, status: 'resolved_no' }),
      p({ id: 'n1', resolved_at: '2026-03-01T00:00:00.000Z', confidence: 90, status: 'resolved_yes' }),
      p({ id: 'n2', resolved_at: '2026-03-02T00:00:00.000Z', confidence: 90, status: 'resolved_yes' }),
    ]);
    expect(drift?.earlier_score).toBeCloseTo(60, 4);
    expect(drift?.recent_score).toBeCloseTo(90, 4);
    expect(drift?.delta).toBeCloseTo(30, 4);
  });

  it('orders by resolved_at regardless of input order', () => {
    const drift = categoryDrift([
      p({ id: 'n2', resolved_at: '2026-03-02T00:00:00.000Z', confidence: 90, status: 'resolved_yes' }),
      p({ id: 'o1', resolved_at: '2026-01-01T00:00:00.000Z', confidence: 90, status: 'resolved_no' }),
      p({ id: 'n1', resolved_at: '2026-03-01T00:00:00.000Z', confidence: 90, status: 'resolved_yes' }),
      p({ id: 'o2', resolved_at: '2026-01-02T00:00:00.000Z', confidence: 90, status: 'resolved_no' }),
    ]);
    // Older half (both no) scores 0-ish vs newer half (both yes) 100 → positive delta.
    expect(drift!.delta).toBeGreaterThan(0);
  });
});
