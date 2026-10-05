import { __setTimeZoneForTests } from './localTime';
import type { Category, Prediction } from '@/types';

import {
  MIN_N_PERIOD,
  buildTrendSummary,
  categoryTrends,
  confidenceCoverage,
  correctionTable,
  horizonFor,
  horizonTrends,
  monthlyTrend,
  overallDelta,
} from './trends';

let seq = 0;

function p(
  confidence: number,
  yes: boolean,
  resolvedAt: string,
  category: Category = 'work',
): Prediction {
  seq += 1;
  return {
    id: `p${seq}`,
    user_id: 'u1',
    title: 'x',
    category,
    confidence,
    created_at: resolvedAt,
    due_date: resolvedAt,
    status: yes ? 'resolved_yes' : 'resolved_no',
    resolved_at: resolvedAt,
    reflection: null,
    integrity_bonus: confidence >= 35 && confidence <= 65,
  };
}

/** n resolutions in one month, `hits` of them correct. */
function month(
  ym: string,
  n: number,
  hits: number,
  confidence = 90,
  category: Category = 'work',
): Prediction[] {
  return Array.from({ length: n }, (_, i) =>
    p(confidence, i < hits, `${ym}-1${(i % 9) + 1}T12:00:00.000Z`, category),
  );
}

describe('monthlyTrend', () => {
  it('groups by month, oldest first', () => {
    const rows = [...month('2026-03', 2, 2), ...month('2026-01', 3, 3)];
    expect(monthlyTrend(rows).map((m) => m.period)).toEqual(['2026-01', '2026-03']);
  });

  // A month with no resolutions is a gap, not a month scoring zero. Zero-filling
  // would draw a cliff where nothing happened.
  it('omits months with no resolutions rather than zero-filling', () => {
    const rows = [...month('2026-01', 2, 2), ...month('2026-04', 2, 2)];
    expect(monthlyTrend(rows)).toHaveLength(2);
  });

  it('scores each month independently', () => {
    // 90% stated, 90% actual → 100. 90% stated, 50% actual → 60.
    const rows = [...month('2026-01', 10, 9), ...month('2026-02', 10, 5)];
    const [jan, feb] = monthlyTrend(rows);
    expect(jan.score).toBeCloseTo(100, 5);
    expect(feb.score).toBeCloseTo(60, 5);
    expect(jan.direction).toBe('calibrated');
    expect(feb.direction).toBe('overconfident');
  });

  // Never present a number built on noise (CLAUDE.md).
  it('flags a thin month as provisional', () => {
    const [thin] = monthlyTrend(month('2026-01', MIN_N_PERIOD - 1, 1));
    expect(thin.provisional).toBe(true);

    const [thick] = monthlyTrend(month('2026-02', MIN_N_PERIOD, 4));
    expect(thick.provisional).toBe(false);
  });

  it('ignores skipped and pending predictions', () => {
    const rows = month('2026-01', 4, 4);
    const skipped: Prediction = { ...rows[0], id: 'skip', status: 'skipped' };
    const pending: Prediction = {
      ...rows[0],
      id: 'pend',
      status: 'pending',
      resolved_at: null,
    };
    expect(monthlyTrend([...rows, skipped, pending])[0].resolved).toBe(4);
  });

  it('returns nothing for no data', () => {
    expect(monthlyTrend([])).toEqual([]);
  });
});

describe('categoryTrends', () => {
  it('sorts worst score first', () => {
    const rows = [
      ...month('2026-01', 20, 20, 90, 'health'), // well calibrated
      ...month('2026-01', 20, 10, 90, 'finance'), // badly overconfident
    ];
    expect(categoryTrends(rows).map((c) => c.category)).toEqual([
      'finance',
      'health',
    ]);
  });

  // "Your worst domain" must never be a category with four resolutions — that
  // is the exact mistake the min-N rule exists to prevent.
  it('sorts provisional categories last however bad they look', () => {
    const rows = [
      ...month('2026-01', 20, 12, 90, 'health'), // real, mediocre
      ...month('2026-01', 3, 0, 90, 'finance'), // thin, looks terrible
    ];
    const [first, second] = categoryTrends(rows);
    expect(first.category).toBe('health');
    expect(second.category).toBe('finance');
    expect(second.provisional).toBe(true);
  });
});

describe('confidenceCoverage', () => {
  it('reports which parts of the range are unused', () => {
    const rows = month('2026-01', 5, 5, 90); // only the [80,100] bucket
    const coverage = confidenceCoverage(rows);
    expect(coverage.buckets_used).toBe(1);
    expect(coverage.coverage).toBeCloseTo(0.2, 5);
    expect(coverage.empty_buckets).toEqual([0, 20, 40, 60]);
  });

  it('counts full coverage across all five buckets', () => {
    const rows = [10, 30, 50, 70, 95].map((c) =>
      p(c, true, '2026-01-10T12:00:00.000Z'),
    );
    const coverage = confidenceCoverage(rows);
    expect(coverage.buckets_used).toBe(5);
    expect(coverage.empty_buckets).toEqual([]);
  });

  it('puts 100 in the top bucket, not a sixth one', () => {
    expect(confidenceCoverage([p(100, true, '2026-01-10T12:00:00.000Z')]))
      .toMatchObject({ buckets_used: 1, empty_buckets: [0, 20, 40, 60] });
  });

  // Whether the integrity bonus is actually pulling people toward honest
  // uncertainty, rather than just existing.
  it('measures the share in the 35–65 honest-uncertainty band', () => {
    const rows = [
      p(40, true, '2026-01-10T12:00:00.000Z'),
      p(60, false, '2026-01-11T12:00:00.000Z'),
      p(95, true, '2026-01-12T12:00:00.000Z'),
      p(90, true, '2026-01-13T12:00:00.000Z'),
    ];
    expect(confidenceCoverage(rows).middle_share).toBeCloseTo(0.5, 5);
  });

  it('reports zeroes for no data instead of dividing by zero', () => {
    expect(confidenceCoverage([])).toEqual({
      buckets_used: 0,
      coverage: 0,
      empty_buckets: [0, 20, 40, 60, 80],
      middle_share: 0,
    });
  });
});

describe('overallDelta', () => {
  it('is positive when the recent half is better calibrated', () => {
    const rows = [
      ...month('2026-01', 6, 3, 90), // early: overconfident
      ...month('2026-06', 6, 6, 90), // later: on the money
    ];
    expect(overallDelta(rows)!).toBeGreaterThan(0);
  });

  it('is negative when calibration is getting worse', () => {
    const rows = [...month('2026-01', 6, 6, 90), ...month('2026-06', 6, 2, 90)];
    expect(overallDelta(rows)!).toBeLessThan(0);
  });

  it('is null below the minimum sample', () => {
    expect(overallDelta(month('2026-01', 4, 2))).toBeNull();
  });
});

describe('buildTrendSummary', () => {
  it('assembles every section in one call', () => {
    const summary = buildTrendSummary([
      ...month('2026-01', 10, 9, 90, 'work'),
      ...month('2026-02', 10, 5, 70, 'finance'),
    ]);
    expect(summary.periods).toHaveLength(2);
    expect(summary.categories).toHaveLength(2);
    expect(summary.coverage.buckets_used).toBe(2);
    expect(summary.delta_recent).not.toBeNull();
  });

  it('is safe on an empty history', () => {
    expect(buildTrendSummary([])).toEqual({
      periods: [],
      categories: [],
      coverage: {
        buckets_used: 0,
        coverage: 0,
        empty_buckets: [0, 20, 40, 60, 80],
        middle_share: 0,
      },
      delta_recent: null,
      horizons: [],
      corrections: [],
      correction_progress: null,
    });
  });
});

describe('correctionTable (roadmap step 20)', () => {
  const T = '2026-03-01T12:00:00.000Z';
  /** n calls at a confidence in one category, `hits` of them happening. */
  const calls = (n: number, hits: number, confidence: number, category: Category) =>
    Array.from({ length: n }, (_, i) => p(confidence, i < hits, T, category));

  it('gives one row per category and band with ten or more, worst first', () => {
    const rows = correctionTable([
      ...calls(17, 8, 90, 'finance'), // 90 said, 47% happened: error 0.43
      ...calls(20, 16, 90, 'health'), // 90 said, 80% happened: error 0.10
      ...calls(12, 8, 70, 'work'), // 70 said, 67% happened: error 0.03
    ]).rows;

    expect(rows.map((r) => `${r.category} ${r.low}`)).toEqual([
      'finance 80',
      'health 80',
      'work 60',
    ]);
    expect(rows[0]).toMatchObject({
      high: 100,
      stated_mean: 90,
      resolved: 17,
      happened: 8,
      direction: 'overconfident',
    });
    expect(rows[0].actual_rate).toBeCloseTo(8 / 17, 5);
    expect(rows[2].direction).toBe('calibrated');
  });

  // CLAUDE.md: never a number built on noise. Nine in a band is still counts.
  it('leaves out bands below ten, and says which band is closest', () => {
    const { rows, progress } = correctionTable([
      ...calls(9, 2, 90, 'finance'),
      ...calls(4, 4, 30, 'social'),
    ]);
    expect(rows).toEqual([]);
    expect(progress).toEqual({ category: 'finance', low: 80, high: 100, resolved: 9 });
  });

  it('caps the table at five rows', () => {
    const many = (['work', 'health', 'finance', 'social', 'personal'] as const).flatMap(
      (c) => [...calls(10, 5, 90, c), ...calls(10, 5, 10, c)],
    );
    expect(correctionTable(many).rows).toHaveLength(5);
  });

  it('ignores skipped predictions', () => {
    const skipped = calls(12, 0, 90, 'work').map((x) => ({ ...x, status: 'skipped' as const }));
    expect(correctionTable(skipped)).toEqual({ rows: [], progress: null });
  });
});

describe('monthlyTrend — local months', () => {
  afterEach(() => __setTimeZoneForTests(null));

  // 20:00 on Jan 31 in California is Feb 1 in UTC. It's January's.
  it("files a resolution on the evening of the 31st under that month", () => {
    __setTimeZoneForTests('America/Los_Angeles');
    const rows = [p(90, true, '2026-02-01T04:00:00.000Z')];
    expect(monthlyTrend(rows).map((m) => m.period)).toEqual(['2026-01']);
  });
});

describe('horizonTrends (roadmap step 21)', () => {
  afterEach(() => __setTimeZoneForTests(null));

  /** n calls logged `daysAhead` local days before they came due. */
  const ahead = (n: number, hits: number, daysAhead: number, confidence = 80) =>
    Array.from({ length: n }, (_, i) => {
      const due = new Date(Date.UTC(2026, 5, 20, 18));
      const created = new Date(due.getTime() - daysAhead * 86_400_000);
      return {
        ...p(confidence, i < hits, due.toISOString()),
        created_at: created.toISOString(),
        due_date: due.toISOString(),
      };
    });

  it('draws the lines at a day, a week and a month', () => {
    expect([0, 1, 2, 7, 8, 31, 32].map(horizonFor)).toEqual([
      'next_day',
      'next_day',
      'week',
      'week',
      'month',
      'month',
      'longer',
    ]);
  });

  it('scores each horizon on its own, nearest first, leaving out empty ones', () => {
    const rows = horizonTrends([
      ...ahead(20, 16, 40), // 80% said, 80% happened
      ...ahead(16, 16, 1, 80), // 80% said, all happened: underconfident
    ]);
    expect(rows.map((r) => r.horizon)).toEqual(['next_day', 'longer']);
    expect(rows[0]).toMatchObject({ resolved: 16, direction: 'underconfident', provisional: false });
    expect(rows[1]).toMatchObject({ resolved: 20, direction: 'calibrated', provisional: false });
  });

  // Same rule as a category: under 15 is counts, not a score.
  it('marks a thin horizon provisional', () => {
    expect(horizonTrends(ahead(14, 7, 5))[0]).toMatchObject({
      horizon: 'week',
      resolved: 14,
      provisional: true,
    });
  });

  it('counts calendar days in local time', () => {
    __setTimeZoneForTests('America/Los_Angeles');
    // Logged 23:30 on Monday, due 08:00 on Wednesday (Pacific): two days, so
    // "within a week", although under 33 hours have passed.
    const row = {
      ...p(70, true, '2026-06-17T15:00:00.000Z'),
      created_at: '2026-06-16T06:30:00.000Z',
      due_date: '2026-06-17T15:00:00.000Z',
    };
    expect(horizonTrends([row])[0].horizon).toBe('week');
  });

  it('leaves out a due date before the log date', () => {
    const backwards = {
      ...p(70, true, '2026-06-10T12:00:00.000Z'),
      created_at: '2026-06-12T12:00:00.000Z',
      due_date: '2026-06-10T12:00:00.000Z',
    };
    expect(horizonTrends([backwards])).toEqual([]);
  });
});
