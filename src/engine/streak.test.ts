import type { Prediction } from '@/types';

import { __setTimeZoneForTests } from './localTime';
import {
  checkpointReached,
  computeStreak,
  isStreakCheckpoint,
  nextStreakCheckpoint,
  REST_DAY_EVERY,
  REST_DAYS_MAX,
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
      restDays: 0,
      restUsed: 0,
      restEarnedToday: false,
      nextRestAt: 7,
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
      restDays: 0,
      restUsed: 0,
      restEarnedToday: false,
      nextRestAt: 7,
    });
  });

  it('starts from nothing', () => {
    expect(streakStatus(logged('2026-05-20T09:00:00.000Z', 1), now)).toEqual({
      streak: 0,
      today: 1,
      todayCounts: false,
      checkpoint: null,
      nextCheckpoint: 7,
      restDays: 0,
      restUsed: 0,
      restEarnedToday: false,
      nextRestAt: 7,
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

// Decided 2026-10-07 (roadmap step 87): every 7 counted days save a rest day,
// up to 2, and a day that doesn't count spends one instead of ending the run.
describe('rest days', () => {
  /** Three logged on each of `days` consecutive local days from `start` (May). */
  const days = (start: number, count: number, n = STREAK_DAY_MIN) =>
    Array.from({ length: count }, (_, i) =>
      logged(`2026-05-${String(start + i).padStart(2, '0')}T08:00:00.000Z`, n),
    ).flat();
  const at = (day: number) => new Date(`2026-05-${String(day).padStart(2, '0')}T15:00:00.000Z`);

  it('saves one every 7 counted days, and no more than 2', () => {
    expect(REST_DAY_EVERY).toBe(7);
    expect(REST_DAYS_MAX).toBe(2);
    expect(streakStatus(days(1, 6), at(6))).toMatchObject({ streak: 6, restDays: 0, nextRestAt: 7 });
    expect(streakStatus(days(1, 7), at(7))).toMatchObject({ streak: 7, restDays: 1, nextRestAt: 14 });
    expect(streakStatus(days(1, 14), at(14))).toMatchObject({ streak: 14, restDays: 2, nextRestAt: null });
    expect(streakStatus(days(1, 21), at(21))).toMatchObject({ streak: 21, restDays: 2, nextRestAt: null });
  });

  it('says the day that saved one, once it counts', () => {
    const before = streakStatus([...days(1, 6), ...days(7, 1, 2)], at(7));
    expect(before).toMatchObject({ streak: 6, restEarnedToday: false });
    const after = streakStatus(days(1, 7), at(7));
    expect(after).toMatchObject({ streak: 7, restEarnedToday: true, checkpoint: 7 });
    // The next day it's saved, not new.
    expect(streakStatus(days(1, 8), at(8))).toMatchObject({ restDays: 1, restEarnedToday: false });
  });

  it('covers a day that did not count, without adding it', () => {
    // 1–7 counted, 8 missed; on the 9th, before three, the streak stands.
    const status = streakStatus(days(1, 7), at(9));
    expect(status).toMatchObject({ streak: 7, restDays: 0, restUsed: 1, todayCounts: false });
    // And today adds to it once it counts.
    expect(streakStatus([...days(1, 7), ...days(9, 1)], at(9))).toMatchObject({
      streak: 8,
      restUsed: 1,
    });
  });

  it('covers a short day the same as an empty one', () => {
    const preds = [...days(1, 7), ...days(8, 1, 2), ...days(9, 1)];
    expect(streakStatus(preds, at(9))).toMatchObject({ streak: 8, restUsed: 1, restDays: 0 });
  });

  it('covers two days in a row with two saved, and ends on the third', () => {
    expect(streakStatus([...days(1, 14), ...days(17, 1)], at(17))).toMatchObject({
      streak: 15,
      restDays: 0,
      restUsed: 2,
    });
    expect(streakStatus(days(1, 14), at(18))).toMatchObject({ streak: 0, restDays: 0, restUsed: 0 });
  });

  it('ends a streak with none saved, as before', () => {
    expect(streakStatus(days(1, 6), at(8))).toMatchObject({ streak: 0, restDays: 0, restUsed: 0 });
  });

  it('starts a new streak with an empty reserve', () => {
    // 1–6, a miss on 7 with nothing saved, then 8–12.
    const status = streakStatus([...days(1, 6), ...days(8, 5)], at(12));
    expect(status).toMatchObject({ streak: 5, restDays: 0, nextRestAt: 7 });
  });

  it('stops reporting a used rest day once a later day counts', () => {
    // 1–7, 8 covered, 9 and 10 counted: on the 10th, yesterday counted.
    const status = streakStatus([...days(1, 7), ...days(9, 2)], at(10));
    expect(status).toMatchObject({ streak: 9, restUsed: 0, restDays: 0, nextRestAt: 14 });
  });

  it('earns again after spending one', () => {
    // 1–7 saves one, 8 spends it, 9–15 counts 7 more (streak 14) and saves another.
    const status = streakStatus([...days(1, 7), ...days(9, 7)], at(15));
    expect(status).toMatchObject({ streak: 14, restDays: 1, restEarnedToday: true });
  });

  it('applies to computeStreak too', () => {
    expect(computeStreak([...days(1, 7), ...days(9, 1)])).toBe(8);
    expect(computeStreak(days(1, 7), { now: at(9) })).toBe(7);
    expect(computeStreak(days(1, 7), { now: at(10) })).toBe(0);
  });
});
