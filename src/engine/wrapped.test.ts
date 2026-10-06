import { MIN_N_OVERALL, type Category, type Prediction } from '@/types';

import { __setTimeZoneForTests } from './localTime';
import { buildWrapped, inWindow, tallyAnswers, weekWindow, yearWindow } from './wrapped';

const NOW = new Date('2026-08-29T12:00:00.000Z');

let seq = 0;

function prediction(over: Partial<Prediction> = {}): Prediction {
  seq += 1;
  return {
    id: `p${seq}`,
    user_id: 'u1',
    title: `Prediction ${seq}`,
    category: 'work',
    confidence: 80,
    created_at: '2026-08-20T00:00:00.000Z',
    due_date: '2026-08-27T00:00:00.000Z',
    status: 'resolved_yes',
    resolved_at: '2026-08-27T00:00:00.000Z',
    reflection: null,
    integrity_bonus: false,
    ...over,
  };
}

/** n resolved predictions inside the week window, `yes` of them correct. */
function run(n: number, yes: number, over: Partial<Prediction> = {}): Prediction[] {
  return Array.from({ length: n }, (_, i) =>
    prediction({
      status: i < yes ? 'resolved_yes' : 'resolved_no',
      resolved_at: '2026-08-27T00:00:00.000Z',
      ...over,
    }),
  );
}

beforeEach(() => {
  seq = 0;
});

describe('windows', () => {
  it('weekWindow spans the seven days ending now', () => {
    const { start, end } = weekWindow(NOW);
    expect(start).toBe('2026-08-22T12:00:00.000Z');
    expect(end).toBe('2026-08-29T12:00:00.000Z');
  });

  it('yearWindow spans the calendar year (UTC under Jest)', () => {
    const { start, end } = yearWindow(NOW);
    expect(start).toBe('2026-01-01T00:00:00.000Z');
    expect(end).toBe('2026-12-31T23:59:59.999Z');
  });

  it('includes both bounds', () => {
    const preds = [
      prediction({ resolved_at: '2026-08-22T12:00:00.000Z' }), // == start
      prediction({ resolved_at: '2026-08-29T12:00:00.000Z' }), // == end
      prediction({ resolved_at: '2026-08-25T00:00:00.000Z' }), // inside
      prediction({ resolved_at: '2026-08-22T11:59:59.999Z' }), // 1ms early
    ];
    const { start, end } = weekWindow(NOW);
    const got = inWindow(preds, start, end);
    expect(got.map((p) => p.resolved_at)).toEqual([
      '2026-08-22T12:00:00.000Z',
      '2026-08-29T12:00:00.000Z',
      '2026-08-25T00:00:00.000Z',
    ]);
  });

  // A resolution logged in the same millisecond the recap is built is exactly
  // the one the user just acted on — leaving it out would be baffling.
  it('counts a resolution landing at the very instant of the recap', () => {
    const w = buildWrapped(
      [prediction({ resolved_at: NOW.toISOString() })],
      'week',
      NOW,
    );
    expect(w.resolved).toBe(1);
  });

  // Synced rows keep PostgREST's serialization; '+' sorts before '.' in ASCII,
  // so string comparison put same-instant boundary rows on the wrong side.
  it('compares instants, not strings, so synced offset timestamps land right', () => {
    const { start, end } = weekWindow(NOW);
    const got = inWindow(
      [
        prediction({ resolved_at: '2026-08-29T12:00:00+00:00' }), // == end
        prediction({ resolved_at: '2026-08-22T12:00:00+00:00' }), // == start
        prediction({ resolved_at: '2026-08-22T11:00:00+00:00' }), // an hour early
      ],
      start,
      end,
    );
    expect(got).toHaveLength(2);
  });

  it('excludes a row whose timestamp cannot be parsed at all', () => {
    const { start, end } = weekWindow(NOW);
    expect(inWindow([prediction({ resolved_at: 'not a date' })], start, end)).toEqual(
      [],
    );
  });

  it('excludes pending and skipped predictions', () => {
    const preds = [
      prediction({ status: 'pending', resolved_at: null }),
      prediction({ status: 'skipped', resolved_at: '2026-08-25T00:00:00.000Z' }),
      prediction({ resolved_at: '2026-08-25T00:00:00.000Z' }),
    ];
    const { start, end } = weekWindow(NOW);
    expect(inWindow(preds, start, end)).toHaveLength(1);
  });
});

describe('buildWrapped', () => {
  it('returns a zeroed recap for an empty window rather than throwing', () => {
    const w = buildWrapped([], 'week', NOW);
    expect(w.resolved).toBe(0);
    expect(w.categories).toEqual([]);
    expect(w.boldest_hit).toBeNull();
    expect(w.score_is_provisional).toBe(true);
  });

  it('ignores resolutions outside the window', () => {
    const w = buildWrapped(
      [
        prediction({ resolved_at: '2026-08-27T00:00:00.000Z' }),
        prediction({ resolved_at: '2026-06-01T00:00:00.000Z' }), // months back
      ],
      'week',
      NOW,
    );
    expect(w.resolved).toBe(1);
  });

  it('summarizes confidence against outcomes', () => {
    // 10 at 80% confidence, 5 right → confident and half wrong.
    const w = buildWrapped(run(10, 5), 'week', NOW);
    expect(w.resolved).toBe(10);
    expect(w.mean_confidence).toBe(80);
    expect(w.hit_rate).toBe(0.5);
    expect(w.direction).toBe('overconfident');
  });

  // Roadmap step 48: the card compares counts, not a hit rate.
  it('counts what happened against what the stated numbers expected', () => {
    const w = buildWrapped(
      [...run(3, 2, { confidence: 70 }), ...run(2, 2, { confidence: 90 })],
      'week',
      NOW,
    );
    expect(w.happened).toBe(4);
    expect(w.expected).toBeCloseTo(3.9); // 0.7 × 3 + 0.9 × 2

    const empty = buildWrapped([], 'week', NOW);
    expect(empty.happened).toBe(0);
    expect(empty.expected).toBe(0);
  });

  it('leaves skips out of both counts', () => {
    const w = buildWrapped(
      [...run(2, 1, { confidence: 60 }), prediction({ status: 'skipped', confidence: 90 })],
      'week',
      NOW,
    );
    expect(w.happened).toBe(1);
    expect(w.expected).toBeCloseTo(1.2);
  });

  // CLAUDE.md: never headline a number built on noise.
  it('flags the score provisional below the overall minimum', () => {
    expect(buildWrapped(run(5, 3), 'week', NOW).score_is_provisional).toBe(true);

    const enough = buildWrapped(run(MIN_N_OVERALL, 16), 'week', NOW);
    expect(enough.resolved).toBe(MIN_N_OVERALL);
    expect(enough.score_is_provisional).toBe(false);
  });

  describe('receipt', () => {
    it('is null for an empty window', () => {
      expect(buildWrapped([], 'week', NOW).receipt).toBeNull();
    });

    it('counts the busiest bucket', () => {
      const w = buildWrapped(
        [...run(3, 2, { confidence: 90 }), ...run(1, 1, { confidence: 50 })],
        'week',
        NOW,
      );
      expect(w.receipt).toEqual({ low: 80, high: 100, said: 3, happened: 2 });
    });

    it('breaks a tie toward the higher bucket', () => {
      const w = buildWrapped(
        [...run(2, 1, { confidence: 30 }), ...run(2, 2, { confidence: 70 })],
        'week',
        NOW,
      );
      expect(w.receipt).toEqual({ low: 60, high: 80, said: 2, happened: 2 });
    });

    it('follows the fixed bucket edges: 20 lands in [20,40)', () => {
      const w = buildWrapped(run(1, 0, { confidence: 20 }), 'week', NOW);
      expect(w.receipt).toEqual({ low: 20, high: 40, said: 1, happened: 0 });
    });
  });

  it('still computes the score while provisional, for trend use', () => {
    const w = buildWrapped(run(4, 2), 'week', NOW);
    expect(w.score_is_provisional).toBe(true);
    expect(w.score).toBeGreaterThan(0);
  });

  it('ranks categories by calibration, best first', () => {
    const w = buildWrapped(
      [
        // health: 4 at 80%, 3 right (75%) — close to calibrated
        ...run(4, 3, { category: 'health' as Category }),
        // finance: 4 at 80%, 0 right — badly overconfident
        ...run(4, 0, { category: 'finance' as Category }),
      ],
      'week',
      NOW,
    );
    expect(w.categories.map((c) => c.category)).toEqual(['health', 'finance']);
    expect(w.categories[1].direction).toBe('overconfident');
  });

  it('counts the honest-uncertainty resolutions', () => {
    const w = buildWrapped(
      [
        prediction({ confidence: 50, integrity_bonus: true }),
        prediction({ confidence: 60, integrity_bonus: true }),
        prediction({ confidence: 95, integrity_bonus: false }),
      ],
      'week',
      NOW,
    );
    expect(w.integrity_count).toBe(2);
  });

  it('picks the boldest call that landed and the one that did not', () => {
    const w = buildWrapped(
      [
        prediction({ confidence: 70, status: 'resolved_yes' }),
        prediction({ confidence: 95, status: 'resolved_yes' }),
        prediction({ confidence: 60, status: 'resolved_no' }),
        prediction({ confidence: 90, status: 'resolved_no' }),
      ],
      'week',
      NOW,
    );
    expect(w.boldest_hit?.confidence).toBe(95);
    expect(w.biggest_miss?.confidence).toBe(90);
  });

  it('breaks a confidence tie toward the more recent call', () => {
    const w = buildWrapped(
      [
        prediction({
          confidence: 90,
          status: 'resolved_yes',
          resolved_at: '2026-08-24T00:00:00.000Z',
          title: 'older',
        }),
        prediction({
          confidence: 90,
          status: 'resolved_yes',
          resolved_at: '2026-08-28T00:00:00.000Z',
          title: 'newer',
        }),
      ],
      'week',
      NOW,
    );
    expect(w.boldest_hit?.title).toBe('newer');
  });

  it('builds a year recap over the calendar year', () => {
    const w = buildWrapped(
      [
        prediction({ resolved_at: '2026-02-10T00:00:00.000Z' }),
        prediction({ resolved_at: '2026-11-30T00:00:00.000Z' }),
        prediction({ resolved_at: '2025-12-31T00:00:00.000Z' }), // last year
      ],
      'year',
      NOW,
    );
    expect(w.span).toBe('year');
    expect(w.resolved).toBe(2);
  });
});

describe('yearWindow — local year', () => {
  afterEach(() => __setTimeZoneForTests(null));

  // "Your 2026" starts at the user's midnight on Jan 1, not London's.
  it('starts and ends at local midnight', () => {
    __setTimeZoneForTests('America/Los_Angeles');
    const { start, end } = yearWindow(new Date('2026-08-29T12:00:00.000Z'));
    expect(start).toBe('2026-01-01T08:00:00.000Z');
    expect(end).toBe('2027-01-01T07:59:59.999Z');
  });

  // New Year's Eve evening in California is already next year in UTC.
  it("picks the local year on New Year's Eve", () => {
    __setTimeZoneForTests('America/Los_Angeles');
    const { start } = yearWindow(new Date('2027-01-01T05:00:00.000Z'));
    expect(start).toBe('2026-01-01T08:00:00.000Z');
  });
});

// Roadmap step 65: the end of a run counts its answers the way a recap does.
describe('tallyAnswers', () => {
  const at = (status: Prediction['status'], confidence: number): Prediction => ({
    id: `${status}-${confidence}`,
    user_id: 'u1',
    title: 't',
    category: 'work',
    confidence,
    created_at: '2026-05-01T00:00:00.000Z',
    due_date: '2026-05-02T00:00:00.000Z',
    status,
    resolved_at: status === 'pending' ? null : '2026-05-02T00:00:00.000Z',
    reflection: null,
    integrity_bonus: false,
  });

  it('counts what happened against the stated numbers, and skips apart', () => {
    const tally = tallyAnswers([
      at('resolved_yes', 70),
      at('resolved_no', 70),
      at('resolved_yes', 70),
      at('skipped', 90),
      at('pending', 50),
    ]);
    expect(tally.resolved).toBe(3);
    expect(tally.happened).toBe(2);
    expect(tally.expected).toBeCloseTo(2.1);
    expect(tally.skipped).toBe(1);
  });

  it('is all zeros for nothing', () => {
    expect(tallyAnswers([])).toEqual({ resolved: 0, happened: 0, expected: 0, skipped: 0 });
  });
});
