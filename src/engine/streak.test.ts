import type { Prediction } from '@/types';

import { __setTimeZoneForTests } from './localTime';
import {
  checkpointReached,
  computeStreak,
  isStreakCheckpoint,
  nextStreakCheckpoint,
  STREAK_DAY_MIN,
  streakStatus,
} from './streak';

let seq = 0;
const p = (overrides: Partial<Prediction> = {}): Prediction => {
  seq += 1;
  return {
    id: `p${seq}`,
    user_id: 'u1',
    title: 't',
    category: 'work',
    confidence: 50,
    created_at: '2026-01-01T00:00:00.000Z',
    due_date: '2026-01-01T00:00:00.000Z',
    status: 'pending',
    resolved_at: null,
    reflection: null,
    integrity_bonus: false,
    ...overrides,
  };
};

/** `n` predictions logged at `iso` (open). */
const logged = (iso: string, n = STREAK_DAY_MIN): Prediction[] =>
  Array.from({ length: n }, () => p({ created_at: iso }));

/** `n` answers at `iso`, each to a prediction logged long before. */
const answered = (
  iso: string,
  n = STREAK_DAY_MIN,
  status: Prediction['status'] = 'resolved_yes',
): Prediction[] =>
  Array.from({ length: n }, () =>
    p({ created_at: '2025-01-01T00:00:00.000Z', status, resolved_at: iso }),
  );

beforeEach(() => {
  seq = 0;
});

// Decided 2026-10-05 (UI_ROADMAP D2): a day counts with at least three
// predictions logged or answered.
describe('computeStreak — what a day needs', () => {
  it('returns 0 for empty input', () => {
    expect(computeStreak([])).toBe(0);
  });

  it('needs three on a day; two is not enough', () => {
    expect(STREAK_DAY_MIN).toBe(3);
    expect(computeStreak(logged('2026-05-19T10:00:00.000Z', 2))).toBe(0);
    expect(computeStreak(logged('2026-05-19T10:00:00.000Z', 3))).toBe(1);
  });

  it('counts logging and answering together', () => {
    const preds = [
      ...logged('2026-05-19T09:00:00.000Z', 1),
      ...answered('2026-05-19T20:00:00.000Z', 2),
    ];
    expect(computeStreak(preds)).toBe(1);
  });

  it('counts one prediction twice when it is logged and answered the same day', () => {
    const preds = [
      p({ created_at: '2026-05-19T08:00:00.000Z', status: 'resolved_no', resolved_at: '2026-05-19T21:00:00.000Z' }),
      ...logged('2026-05-19T09:00:00.000Z', 1),
    ];
    expect(computeStreak(preds)).toBe(1);
  });

  it('gives nothing for a skip', () => {
    const preds = [
      ...answered('2026-05-19T10:00:00.000Z', 2),
      ...answered('2026-05-19T11:00:00.000Z', 1, 'skipped'),
    ];
    const status = streakStatus(preds, new Date('2026-05-19T20:00:00.000Z'));
    expect(status).toMatchObject({ streak: 0, today: 2, todayCounts: false });
  });

  it('counts consecutive days and breaks on a short one', () => {
    const preds = [
      ...logged('2026-05-15T08:00:00.000Z'),
      ...logged('2026-05-16T08:00:00.000Z', 2), // short: breaks the run
      ...logged('2026-05-17T08:00:00.000Z'),
      ...answered('2026-05-18T08:00:00.000Z'),
      ...logged('2026-05-19T08:00:00.000Z'),
    ];
    expect(computeStreak(preds)).toBe(3);
  });

  it('is unaffected by ordering of input', () => {
    const preds = [
      ...logged('2026-05-17T08:00:00.000Z'),
      ...logged('2026-05-18T08:00:00.000Z'),
      ...logged('2026-05-19T08:00:00.000Z'),
    ];
    expect(computeStreak([...preds].reverse())).toBe(3);
  });

  it('ignores an unparseable timestamp', () => {
    const preds = [...logged('2026-05-19T08:00:00.000Z', 2), p({ created_at: 'not a date' })];
    expect(computeStreak(preds)).toBe(0);
  });
});

describe('computeStreak — local days', () => {
  afterEach(() => __setTimeZoneForTests(null));

  // In UTC, Pacific-time activity at 10:00 Monday and 18:00 Tuesday lands on
  // Monday and *Wednesday*, and the streak breaks over a day never missed.
  it('counts consecutive local days that are not consecutive in UTC', () => {
    __setTimeZoneForTests('America/Los_Angeles');
    const preds = [
      ...logged('2026-05-18T17:00:00.000Z'), // Mon 10:00 PDT
      ...logged('2026-05-20T01:00:00.000Z'), // Tue 18:00 PDT
    ];
    expect(computeStreak(preds)).toBe(2);
  });

  // And the reverse: two UTC days that are one local evening.
  it('adds up one local evening that spans UTC midnight', () => {
    __setTimeZoneForTests('America/Los_Angeles');
    const preds = [
      ...logged('2026-05-19T23:30:00.000Z', 2), // Tue 16:30 PDT
      ...logged('2026-05-20T02:30:00.000Z', 1), // Tue 19:30 PDT
    ];
    expect(computeStreak(preds)).toBe(1);
  });

  it('survives a DST change mid-streak', () => {
    __setTimeZoneForTests('America/Los_Angeles');
    const preds = [
      ...logged('2026-03-07T20:00:00.000Z'),
      ...logged('2026-03-08T20:00:00.000Z'), // clocks moved
      ...logged('2026-03-09T20:00:00.000Z'),
    ];
    expect(computeStreak(preds)).toBe(3);
  });
});

describe('computeStreak — expiry', () => {
  const run = () => [
    ...logged('2026-05-17T08:00:00.000Z'),
    ...logged('2026-05-18T08:00:00.000Z'),
    ...logged('2026-05-19T08:00:00.000Z'),
  ];

  it('is current when the last counted day is today', () => {
    expect(computeStreak(run(), { now: new Date('2026-05-19T20:00:00.000Z') })).toBe(3);
  });

  // Not yet broken: there's still today to extend it.
  it('is still current when the last counted day was yesterday', () => {
    expect(computeStreak(run(), { now: new Date('2026-05-20T20:00:00.000Z') })).toBe(3);
  });

  it('has ended once a whole day passes without three', () => {
    expect(computeStreak(run(), { now: new Date('2026-05-21T00:30:00.000Z') })).toBe(0);
  });
});

describe('streakStatus — where today stands', () => {
  const now = new Date('2026-05-20T15:00:00.000Z');
  const yesterdayRun = () => [
    ...logged('2026-05-18T08:00:00.000Z'),
    ...logged('2026-05-19T08:00:00.000Z'),
  ];

  it('runs through yesterday while today is short, and says how far today has got', () => {
    const status = streakStatus([...yesterdayRun(), ...logged('2026-05-20T09:00:00.000Z', 2)], now);
    expect(status).toEqual({
      streak: 2,
      today: 2,
      todayCounts: false,
      checkpoint: null,
      nextCheckpoint: 7,
    });
  });

  it('adds today once it reaches three', () => {
    const status = streakStatus([...yesterdayRun(), ...logged('2026-05-20T09:00:00.000Z', 3)], now);
    expect(status).toEqual({
      streak: 3,
      today: 3,
      todayCounts: true,
      checkpoint: null,
      nextCheckpoint: 7,
    });
  });

  it('starts from nothing', () => {
    expect(streakStatus(logged('2026-05-20T09:00:00.000Z', 1), now)).toEqual({
      streak: 0,
      today: 1,
      todayCounts: false,
      checkpoint: null,
      nextCheckpoint: 7,
    });
    expect(streakStatus([], now)).toMatchObject({ streak: 0, today: 0, todayCounts: false });
  });
});

// Decided 2026-10-06: the streak is marked at 7, 30, 100 and 365 days, then
// every further year.
describe('streak checkpoints', () => {
  it('are a week, a month, a hundred days, a year, then each further year', () => {
    const marked = Array.from({ length: 1100 }, (_, i) => i).filter(isStreakCheckpoint);
    expect(marked).toEqual([7, 30, 100, 365, 730, 1095]);
    expect(isStreakCheckpoint(7.5)).toBe(false);
    expect(isStreakCheckpoint(-7)).toBe(false);
  });

  it('point at the next one above the streak', () => {
    expect(nextStreakCheckpoint(0)).toBe(7);
    expect(nextStreakCheckpoint(6)).toBe(7);
    expect(nextStreakCheckpoint(7)).toBe(30);
    expect(nextStreakCheckpoint(99)).toBe(100);
    expect(nextStreakCheckpoint(100)).toBe(365);
    expect(nextStreakCheckpoint(365)).toBe(730);
    expect(nextStreakCheckpoint(800)).toBe(1095);
  });

  // Seven days ending 2026-05-20: six before today, and today with `todayN`.
  const now = new Date('2026-05-20T15:00:00.000Z');
  const week = (todayN: number) => [
    ...Array.from({ length: 6 }, (_, i) =>
      logged(`2026-05-${String(14 + i).padStart(2, '0')}T08:00:00.000Z`),
    ).flat(),
    ...logged('2026-05-20T09:00:00.000Z', todayN),
  ];

  it('mark the day itself once it counts', () => {
    expect(streakStatus(week(3), now)).toMatchObject({
      streak: 7,
      checkpoint: 7,
      nextCheckpoint: 30,
    });
  });

  it('wait for today to count, and point at the one today can reach', () => {
    expect(streakStatus(week(2), now)).toMatchObject({
      streak: 6,
      checkpoint: null,
      nextCheckpoint: 7,
    });
  });

  it('are behind it the next day', () => {
    const tomorrow = new Date('2026-05-21T15:00:00.000Z');
    const status = streakStatus([...week(3), ...logged('2026-05-21T09:00:00.000Z')], tomorrow);
    expect(status).toMatchObject({ streak: 8, checkpoint: null, nextCheckpoint: 30 });
  });

  it('are reached by the log or answer that makes the day count', () => {
    const before = streakStatus(week(2), now);
    const after = streakStatus(week(3), now);
    expect(checkpointReached(before, after)).toBe(7);
    // A fourth on the same day reached nothing new.
    expect(checkpointReached(after, streakStatus(week(4), now))).toBeNull();
    // Nor did one that leaves the day short.
    expect(checkpointReached(streakStatus(week(1), now), before)).toBeNull();
  });
});
