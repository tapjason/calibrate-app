import { __setTimeZoneForTests } from './localTime';
import type { Category, Prediction } from '@/types';

import {
  MIN_N_PERIOD,
  buildTrendSummary,
  categoryTrends,
  confidenceCoverage,
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
    });
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
