import { categoryDrift } from '@/engine/patterns';
import {
  MIN_N_CATEGORY,
  MIN_N_OVERALL,
  type Category,
  type Prediction,
  type UserStat,
} from '@/types';

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

  // Roadmap D41: an answer the day it was logged isn't scored, Coach included.
  it('excludes answers given the day they were logged', () => {
    const ctx = buildCoachContext(USER_STAT, [
      prediction({
        created_at: new Date(2026, 7, 5, 9).toISOString(),
        resolved_at: new Date(2026, 7, 5, 20).toISOString(),
      }),
      prediction({ status: 'resolved_yes' }),
    ]);
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

  /** n answers on one weekday (Mondays from 2026-08-03), a week apart. */
  function sameWeekday(n: number, category: Category = 'work'): Prediction[] {
    return Array.from({ length: n }, (_, i) =>
      prediction({
        category,
        status: i % 2 === 0 ? 'resolved_yes' : 'resolved_no',
        resolved_at: new Date(Date.UTC(2026, 7, 3 + i * 7)).toISOString(),
      }),
    );
  }

  // The weekday ran from 5 answers on a day, with no overall floor, until
  // 2026-11-18 (security review, finding 1); this test then asserted 6 were
  // enough, and from then MIN_N_BAND (10). No figure the Coach cites comes
  // from fewer than 20 answers (2026-11-19): it now needs MIN_N_CATEGORY on
  // the day, and MIN_N_OVERALL scored.
  it('emits deterministic patterns as plain kind/value pairs', () => {
    const ctx = buildCoachContext(USER_STAT, sameWeekday(MIN_N_CATEGORY));

    for (const p of ctx.patterns) {
      expect(typeof p.kind).toBe('string');
      expect(Number.isFinite(p.value)).toBe(true);
    }
    expect(ctx.patterns).toEqual(
      expect.arrayContaining([
        { kind: 'weakest_day_of_week', value: 1 },
        { kind: 'weakest_day_score', value: expect.any(Number) },
        { kind: 'weakest_day_answers', value: MIN_N_CATEGORY },
      ]),
    );
  });

  it('leaves out a weekday with fewer than MIN_N_CATEGORY answers on it', () => {
    const ctx = buildCoachContext(USER_STAT, sameWeekday(MIN_N_CATEGORY - 1));
    expect(ctx.patterns.filter((p) => p.kind.startsWith('weakest_day'))).toEqual([]);
  });

  it('leaves out the weekday while the overall rating is provisional', () => {
    const ctx = buildCoachContext(
      { ...USER_STAT, total_resolved: MIN_N_OVERALL - 1 },
      sameWeekday(MIN_N_CATEGORY),
    );
    expect(ctx.patterns.filter((p) => p.kind.startsWith('weakest_day'))).toEqual([]);
  });

  /** n health answers, `yes` of them happening, one a day from 2026-08-10. */
  function daily(n: number, yes: number): Prediction[] {
    return Array.from({ length: n }, (_, i) =>
      prediction({
        category: 'health',
        status: i < yes ? 'resolved_yes' : 'resolved_no',
        resolved_at: new Date(Date.UTC(2026, 7, 10 + i, 12)).toISOString(),
      }),
    );
  }

  // A category's drift ran from 4 answers (finding 1): a 50-point "fall"
  // between two halves of 2. From 2026-11-18 it needed 20 in the category
  // (halves of 10); from 2026-11-19, MIN_N_CATEGORY in each half, so 40.
  it('sends a category’s drift only with MIN_N_CATEGORY answers in each half', () => {
    const halfOf19 = buildCoachContext(USER_STAT, daily(2 * MIN_N_CATEGORY - 1, 20));
    expect(halfOf19.patterns.filter((p) => p.kind.startsWith('drift_'))).toEqual([]);
    // Still carried as a category, with its count, so "keep logging" can be said.
    expect(halfOf19.by_category[0]).toMatchObject({ category: 'health', resolved: 2 * MIN_N_CATEGORY - 1 });

    const halvesOf20 = buildCoachContext(USER_STAT, daily(2 * MIN_N_CATEGORY, 20));
    expect(halvesOf20.patterns).toEqual(
      expect.arrayContaining([
        { kind: 'drift_health', value: expect.any(Number) },
        { kind: 'drift_half_answers_health', value: MIN_N_CATEGORY },
      ]),
    );
  });

  // The halves' count follows categoryDrift's own split: the answers with a
  // resolved_at, the older half taking floor(n / 2). An answer without one
  // counts in the category but in neither half.
  it('counts the halves the way categoryDrift splits them', () => {
    const list = daily(2 * MIN_N_CATEGORY + 1, 20);
    const withGap = list.map((p, i) => (i === 0 ? { ...p, resolved_at: null } : p));
    const ctx = buildCoachContext(USER_STAT, withGap);
    expect(ctx.by_category[0].resolved).toBe(2 * MIN_N_CATEGORY + 1);
    expect(ctx.patterns).toEqual(
      expect.arrayContaining([{ kind: 'drift_half_answers_health', value: MIN_N_CATEGORY }]),
    );
    const drift = categoryDrift(withGap);
    expect(ctx.patterns.find((p) => p.kind === 'drift_health')?.value).toBe(drift?.delta);

    // Two without one: 39 split, a half of 19, and no drift sent.
    const twoGaps = list.map((p, i) => (i < 2 ? { ...p, resolved_at: null } : p));
    expect(buildCoachContext(USER_STAT, twoGaps).patterns.filter((p) => p.kind.startsWith('drift_'))).toEqual([]);
  });

  it('never sends a pattern for a category the person added', () => {
    const ctx = buildCoachContext(USER_STAT, run(30, 15, { category: 'c-abcd1234' as Category }));
    expect(JSON.stringify(ctx)).not.toMatch(/c-abcd1234/);
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
