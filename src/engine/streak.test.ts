import type { Prediction } from '@/types';

import { __setTimeZoneForTests } from './localTime';
import { computeStreak } from './streak';

const p = (overrides: Partial<Prediction> = {}): Prediction => ({
  id: 'p',
  user_id: 'u1',
  title: 't',
  category: 'work',
  confidence: 50,
  created_at: '2026-01-01T00:00:00.000Z',
  due_date: '2026-01-01T00:00:00.000Z',
  status: 'resolved_yes',
  resolved_at: '2026-01-01T12:00:00.000Z',
  reflection: null,
  integrity_bonus: false,
  ...overrides,
});

describe('computeStreak', () => {
  it('returns 0 for empty input', () => {
    expect(computeStreak([])).toBe(0);
  });

  it('returns 0 when no predictions have resolved_at', () => {
    expect(
      computeStreak([p({ status: 'pending', resolved_at: null })]),
    ).toBe(0);
  });

  it('returns 1 for a single resolved day', () => {
    expect(computeStreak([p({ resolved_at: '2026-05-19T10:00:00.000Z' })])).toBe(1);
  });

  it('counts consecutive days', () => {
    const preds = [
      p({ id: 'a', resolved_at: '2026-05-17T08:00:00.000Z' }),
      p({ id: 'b', resolved_at: '2026-05-18T08:00:00.000Z' }),
      p({ id: 'c', resolved_at: '2026-05-19T08:00:00.000Z' }),
    ];
    expect(computeStreak(preds)).toBe(3);
  });

  it('collapses multiple resolutions on the same day to one', () => {
    const preds = [
      p({ id: 'a', resolved_at: '2026-05-19T03:00:00.000Z' }),
      p({ id: 'b', resolved_at: '2026-05-19T15:00:00.000Z' }),
      p({ id: 'c', resolved_at: '2026-05-19T22:00:00.000Z' }),
    ];
    expect(computeStreak(preds)).toBe(1);
  });

  it('breaks the streak on a gap', () => {
    const preds = [
      p({ id: 'a', resolved_at: '2026-05-15T08:00:00.000Z' }),
      // gap: 5/16 missing
      p({ id: 'b', resolved_at: '2026-05-17T08:00:00.000Z' }),
      p({ id: 'c', resolved_at: '2026-05-18T08:00:00.000Z' }),
      p({ id: 'd', resolved_at: '2026-05-19T08:00:00.000Z' }),
    ];
    // streak from 5/19 → 5/18 → 5/17, then gap, so 3
    expect(computeStreak(preds)).toBe(3);
  });

  it('is unaffected by ordering of input', () => {
    const a = p({ id: 'a', resolved_at: '2026-05-17T08:00:00.000Z' });
    const b = p({ id: 'b', resolved_at: '2026-05-18T08:00:00.000Z' });
    const c = p({ id: 'c', resolved_at: '2026-05-19T08:00:00.000Z' });
    expect(computeStreak([c, a, b])).toBe(3);
  });

  it('ignores skipped resolutions even when resolved_at is set', () => {
    const preds = [
      p({ id: 'a', status: 'resolved_yes', resolved_at: '2026-05-17T08:00:00.000Z' }),
      p({ id: 'b', status: 'skipped',      resolved_at: '2026-05-18T08:00:00.000Z' }),
      p({ id: 'c', status: 'resolved_no',  resolved_at: '2026-05-19T08:00:00.000Z' }),
    ];
    // 5/18 is a skip → gap. Streak from 5/19 alone is 1.
    expect(computeStreak(preds)).toBe(1);
  });
});

describe('computeStreak — local days', () => {
  afterEach(() => __setTimeZoneForTests(null));

  // The regression: in UTC, Pacific-time resolutions at 10:00 Monday and
  // 18:00 Tuesday land on Monday and *Wednesday*, and the streak breaks over
  // a day the user never missed.
  it('counts consecutive local days that are not consecutive in UTC', () => {
    __setTimeZoneForTests('America/Los_Angeles');
    const preds = [
      p({ id: 'mon', resolved_at: '2026-05-18T17:00:00.000Z' }), // Mon 10:00 PDT
      p({ id: 'tue', resolved_at: '2026-05-20T01:00:00.000Z' }), // Tue 18:00 PDT
    ];
    expect(computeStreak(preds)).toBe(2);
  });

  // And the reverse: two UTC days that are one local evening.
  it('collapses one local evening that spans UTC midnight', () => {
    __setTimeZoneForTests('America/Los_Angeles');
    const preds = [
      p({ id: 'a', resolved_at: '2026-05-19T23:30:00.000Z' }), // Tue 16:30 PDT
      p({ id: 'b', resolved_at: '2026-05-20T02:30:00.000Z' }), // Tue 19:30 PDT
    ];
    expect(computeStreak(preds)).toBe(1);
  });

  it('survives a DST change mid-streak', () => {
    __setTimeZoneForTests('America/Los_Angeles');
    const preds = [
      p({ id: 'sat', resolved_at: '2026-03-07T20:00:00.000Z' }),
      p({ id: 'sun', resolved_at: '2026-03-08T20:00:00.000Z' }), // clocks moved
      p({ id: 'mon', resolved_at: '2026-03-09T20:00:00.000Z' }),
    ];
    expect(computeStreak(preds)).toBe(3);
  });
});

describe('computeStreak — expiry', () => {
  const run = [
    p({ id: 'a', resolved_at: '2026-05-17T08:00:00.000Z' }),
    p({ id: 'b', resolved_at: '2026-05-18T08:00:00.000Z' }),
    p({ id: 'c', resolved_at: '2026-05-19T08:00:00.000Z' }),
  ];

  it('is current when the latest resolution was today', () => {
    expect(computeStreak(run, { now: new Date('2026-05-19T20:00:00.000Z') })).toBe(3);
  });

  // Not yet broken: there's still today to extend it.
  it('is still current when the latest resolution was yesterday', () => {
    expect(computeStreak(run, { now: new Date('2026-05-20T20:00:00.000Z') })).toBe(3);
  });

  // The old behavior showed "streak 3" forever after the user stopped.
  it('has ended once a whole day passes with no resolution', () => {
    expect(computeStreak(run, { now: new Date('2026-05-21T00:30:00.000Z') })).toBe(0);
  });

  it('judges "yesterday" in local days', () => {
    __setTimeZoneForTests('America/Los_Angeles');
    // Latest: Tue 19 May 01:00 PDT. Now: Wed 20 May 23:00 PDT → yesterday.
    const preds = [p({ resolved_at: '2026-05-19T08:00:00.000Z' })];
    expect(computeStreak(preds, { now: new Date('2026-05-21T06:00:00.000Z') })).toBe(1);
    __setTimeZoneForTests(null);
  });
});
