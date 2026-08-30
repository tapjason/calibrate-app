import type { Category, Prediction, UserStat } from '@/types';

import { buildCoachContext } from './coachContext';

const USER_STAT: UserStat = {
  user_id: 'u1',
  calibration_rating: 72,
  total_predictions: 50,
  total_resolved: 40,
  current_streak: 2,
  rating_is_provisional: false,
};

let seq = 0;

function prediction(over: Partial<Prediction> = {}): Prediction {
  seq += 1;
  return {
    id: `p${seq}`,
    user_id: 'u1',
    title: `Secret plan ${seq}`,
    category: 'work',
    confidence: 80,
    created_at: '2026-08-01T00:00:00.000Z',
    due_date: '2026-08-10T00:00:00.000Z',
    status: 'resolved_yes',
    resolved_at: `2026-08-${String(10 + seq).padStart(2, '0')}T00:00:00.000Z`,
    reflection: 'Something personal I wrote',
    integrity_bonus: false,
    ...over,
  };
}

function run(n: number, yes: number, over: Partial<Prediction> = {}): Prediction[] {
  return Array.from({ length: n }, (_, i) =>
    prediction({ status: i < yes ? 'resolved_yes' : 'resolved_no', ...over }),
  );
}

beforeEach(() => {
  seq = 0;
});

describe('buildCoachContext', () => {
  it('carries the overall figures through unchanged', () => {
    const ctx = buildCoachContext(USER_STAT, run(4, 2));
    expect(ctx.overall).toEqual({ calibration_rating: 72, total_resolved: 40 });
  });

  // COACH_AGENT.md §4 freetext rule — the cheapest safeguard is not sending it.
  it('sends no freetext: no titles and no reflections anywhere in the payload', () => {
    const ctx = buildCoachContext(
      USER_STAT,
      run(4, 2, { title: 'Leave my job', reflection: 'I felt awful about it' }),
    );
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toMatch(/Leave my job/);
    expect(serialized).not.toMatch(/felt awful/);
    expect(serialized).not.toMatch(/Secret plan/);
  });

  it('aggregates each category into stated confidence vs. reality', () => {
    const ctx = buildCoachContext(
      USER_STAT,
      run(10, 5, { category: 'finance' as Category, confidence: 80 }),
    );
    const finance = ctx.by_category.find((c) => c.category === 'finance');
    expect(finance).toMatchObject({
      resolved: 10,
      mean_stated_confidence: 80,
      actual_rate: 0.5,
      direction: 'overconfident',
    });
  });

  it('excludes pending and skipped predictions', () => {
    const ctx = buildCoachContext(USER_STAT, [
      prediction({ status: 'pending', resolved_at: null }),
      prediction({ status: 'skipped' }),
      prediction({ status: 'resolved_yes' }),
    ]);
    expect(ctx.by_category).toHaveLength(1);
    expect(ctx.by_category[0].resolved).toBe(1);
  });

  // Thin categories are included ON PURPOSE: the Coach has to be able to see
  // that a category is thin in order to say "keep logging" instead of guessing.
  it('includes a thin category with its real resolution count', () => {
    const ctx = buildCoachContext(USER_STAT, [
      ...run(2, 1, { category: 'health' as Category }),
      ...run(20, 10, { category: 'finance' as Category }),
    ]);
    const health = ctx.by_category.find((c) => c.category === 'health');
    expect(health?.resolved).toBe(2);
  });

  it('orders categories deterministically', () => {
    const ctx = buildCoachContext(USER_STAT, [
      ...run(2, 1, { category: 'work' as Category }),
      ...run(2, 1, { category: 'finance' as Category }),
      ...run(2, 1, { category: 'health' as Category }),
    ]);
    expect(ctx.by_category.map((c) => c.category)).toEqual([
      'finance',
      'health',
      'work',
    ]);
  });

  it('produces the same payload twice for the same input', () => {
    const preds = run(8, 5, { category: 'work' as Category });
    expect(buildCoachContext(USER_STAT, preds)).toEqual(
      buildCoachContext(USER_STAT, preds),
    );
  });

  it('emits deterministic patterns as plain kind/value pairs', () => {
    // weakestDayOfWeek needs at least five resolutions landing on one weekday,
    // so these are spaced a week apart rather than on consecutive days.
    const sameWeekday = Array.from({ length: 6 }, (_, i) =>
      prediction({
        category: 'work' as Category,
        status: i < 3 ? 'resolved_yes' : 'resolved_no',
        resolved_at: `2026-08-${String(3 + i * 7).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );
    const ctx = buildCoachContext(USER_STAT, sameWeekday);

    for (const p of ctx.patterns) {
      expect(typeof p.kind).toBe('string');
      expect(Number.isFinite(p.value)).toBe(true);
    }
    expect(ctx.patterns.some((p) => p.kind === 'weakest_day_of_week')).toBe(true);
  });

  it('handles a user with nothing resolved', () => {
    const ctx = buildCoachContext(
      { ...USER_STAT, total_resolved: 0, calibration_rating: 0 },
      [],
    );
    expect(ctx.by_category).toEqual([]);
    expect(ctx.patterns).toEqual([]);
  });
});
