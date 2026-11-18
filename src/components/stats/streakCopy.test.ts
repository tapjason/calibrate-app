import type { StreakStatus } from '@/types';

import { checkpointCopy, checkpointName, streakCopy } from './streakCopy';

/** A status with the engine's checkpoint fields filled in plainly. */
const status = (s: Partial<StreakStatus> & Pick<StreakStatus, 'streak' | 'today' | 'todayCounts'>): StreakStatus => ({
  checkpoint: null,
  nextCheckpoint: 7,
  // Nothing to say about rest days unless a test asks (step 87).
  restDays: 0,
  restUsed: 0,
  restEarnedToday: false,
  nextRestAt: null,
  ...s,
});

// Roadmap D2: days, with three logged or answered to count, and the line says
// what today adds rather than what it would cost.
describe('streakCopy', () => {
  it('stays hidden with no streak and nothing today', () => {
    expect(streakCopy(status({ streak: 0, today: 0, todayCounts: false }))).toBeNull();
  });

  // D17: one prediction keeps the streak, three is the day's goal.
  it('says what one prediction today adds to a running streak', () => {
    expect(
      streakCopy(status({ streak: 12, today: 0, todayCounts: false, nextCheckpoint: 30 })),
    ).toMatchObject({
      headline: '12-day streak',
      detail: 'One prediction today makes it 13',
      filled: 0,
      spoken: '12-day streak. One prediction today makes it 13.',
    });
  });

  it("says when today counts, and how far it is from the day's goal", () => {
    expect(
      streakCopy(status({ streak: 13, today: 1, todayCounts: true, nextCheckpoint: 30 })),
    ).toMatchObject({
      headline: '13-day streak',
      // No-break spaces inside the goal, so 320pt can't split "2 of / 3" (step 95).
      detail: 'Today counts. Goal:\u00A01\u00A0of\u00A03',
      filled: 1,
      checkpoint: false,
    });
  });

  it('says when the goal is met, what the next milestone is, and never overfills the pips', () => {
    expect(
      streakCopy(status({ streak: 13, today: 5, todayCounts: true, nextCheckpoint: 30 })),
    ).toMatchObject({
      detail: "Today's goal met.\nNext milestone: 30\u00A0days",
      filled: 3,
    });
  });

  it('never talks about losing it, or asks for more than the streak needs', () => {
    const lines = [
      streakCopy(status({ streak: 1, today: 0, todayCounts: false })),
      streakCopy(status({ streak: 4, today: 2, todayCounts: true })),
      streakCopy(status({ streak: 6, today: 0, todayCounts: false })),
    ].map((c) => `${c?.headline} ${c?.detail ?? ''}`);
    for (const line of lines) expect(line).not.toMatch(/lose|lost|break|miss|keep/i);
  });
});

// Decided 2026-10-06: the streak is marked at 7, 30, 100 and 365 days, then
// every further year.
describe('streak checkpoints', () => {
  it('names the day it reaches one, and what comes next', () => {
    expect(
      streakCopy(status({ streak: 7, today: 3, todayCounts: true, checkpoint: 7, nextCheckpoint: 30 })),
    ).toEqual({
      headline: '7-day streak',
      count: '7',
      unit: 'day streak',
      counted: true,
      detail: 'A full week.\nNext milestone: 30\u00A0days',
      filled: 3,
      spoken: '7-day streak. A full week. Next milestone: 30\u00A0days.',
      checkpoint: true,
      rest: null,
    });
  });

  it('says so the day before, as a gain', () => {
    expect(
      streakCopy(status({ streak: 29, today: 0, todayCounts: false, nextCheckpoint: 30 }))?.detail,
    ).toBe('One prediction today makes it 30: a full month');
    // Once today has counted, the day before is tomorrow's.
    expect(
      streakCopy(status({ streak: 6, today: 3, todayCounts: true, nextCheckpoint: 7 }))?.detail,
    ).toBe('Today counts. Tomorrow can make it 7: a full week');
  });

  it('has a name for each', () => {
    expect([7, 30, 100, 365, 730, 1095, 4380].map(checkpointName)).toEqual([
      'A full week',
      'A full month',
      'Triple digits',
      'A full year',
      'Two full years',
      'Three full years',
      '12 full years',
    ]);
  });

  it('words the Resolve card', () => {
    expect(checkpointCopy(100, 365)).toEqual({
      title: 'Triple digits',
      body: 'Next milestone: 365\u00A0days.',
      spoken: '100-day streak. Triple digits. Next milestone: 365\u00A0days.',
    });
  });
});

// Step 193 (D67): the row draws the count as its own figure, then "day
// streak", and fills the flame once today counts. The headline and the
// spoken sentence keep "149-day streak" for VoiceOver and every other caller.
describe('streakCopy, the row figure and flame (step 193)', () => {
  it('has an outline flame before today counts, with the figure and its unit', () => {
    expect(streakCopy(status({ streak: 149, today: 0, todayCounts: false, nextCheckpoint: 365 }))).toMatchObject({
      counted: false,
      count: '149',
      unit: 'day streak',
      headline: '149-day streak',
      spoken: '149-day streak. One prediction today makes it 150.',
    });
  });

  it('fills the flame once today counts', () => {
    expect(streakCopy(status({ streak: 150, today: 1, todayCounts: true, nextCheckpoint: 365 }))).toMatchObject({
      counted: true,
      count: '150',
      unit: 'day streak',
      headline: '150-day streak',
      spoken: '150-day streak. Today counts. Goal:\u00A01\u00A0of\u00A03.',
    });
  });

  it('counts on a checkpoint day, which is always one that counts', () => {
    expect(
      streakCopy(status({ streak: 100, today: 1, todayCounts: true, checkpoint: 100, nextCheckpoint: 365 })),
    ).toMatchObject({
      counted: true,
      checkpoint: true,
      count: '100',
      unit: 'day streak',
      headline: '100-day streak',
      spoken: '100-day streak. Triple digits. Next milestone: 365\u00A0days.',
    });
  });

  it('groups a long streak in the figure as in the headline', () => {
    const copy = streakCopy(status({ streak: 1001, today: 0, todayCounts: false, nextCheckpoint: 1095 }));
    expect(copy?.count).toMatch(/^1\D001$/);
    expect(copy?.headline).toBe(`${copy?.count}-day streak`);
  });

  it('keeps the sentence of a streak that ended, its flame not counted', () => {
    const copy = streakCopy(
      status({ streak: 0, today: 0, todayCounts: false, ended: { days: 151, on: '2026-11-12T00:00:00', ago: 1 } }),
    );
    expect(copy).toMatchObject({
      counted: false,
      count: '151',
      unit: 'day streak',
      headline: 'Your 151-day streak ended yesterday',
      ended: true,
    });
  });
});

// Decided 2026-10-07 (roadmap step 87): the reserve gets one quiet line.
describe('streakCopy — rest days', () => {
  const running = (s: Partial<StreakStatus>) =>
    streakCopy(status({ streak: 9, today: 0, todayCounts: false, nextCheckpoint: 30, ...s }));

  it('says when the next one comes while none is saved', () => {
    expect(running({ nextRestAt: 14 })).toMatchObject({
      rest: 'A rest day comes with day\u00A014',
      spoken: '9-day streak. One prediction today makes it 10. A rest day comes with day\u00A014.',
    });
  });

  it('says how many are saved', () => {
    expect(running({ restDays: 1, nextRestAt: 14 })?.rest).toBe('1 rest day saved');
    expect(running({ restDays: 2 })?.rest).toBe('2 rest days saved');
  });

  it('says the day one is saved', () => {
    expect(
      streakCopy(status({ streak: 7, today: 3, todayCounts: true, checkpoint: 7, nextCheckpoint: 30, restDays: 1, restEarnedToday: true })),
    ).toMatchObject({
      detail: 'A full week.\nNext milestone: 30\u00A0days',
      rest: 'Today saved a rest day',
    });
    expect(running({ restDays: 2, restEarnedToday: true })?.rest).toBe('Today saved a second rest day');
  });

  it('says a spent one first, as a relief', () => {
    // Blind playtest 2026-11-13b, run 3: an empty reserve is said.
    expect(running({ restUsed: 1, nextRestAt: 14 })?.rest).toBe(
      'Yesterday was a rest day. None saved now; the next comes with day 14',
    );
    expect(running({ restUsed: 1, restDays: 1 })?.rest).toBe('Yesterday was a rest day. 1 more saved');
    expect(running({ restUsed: 2, nextRestAt: 14 })?.rest).toBe(
      'The last 2 days were rest days. None saved now; the next comes with day 14',
    );
  });

  it('says nothing before a streak starts', () => {
    expect(streakCopy(status({ streak: 0, today: 0, todayCounts: false, nextRestAt: 7 }))).toBeNull();
  });

  it('never talks about losing it', () => {
    const lines = [
      running({ restUsed: 1 }),
      running({ restUsed: 2 }),
      running({ nextRestAt: 14 }),
    ].map((c) => c?.rest ?? '');
    for (const line of lines) expect(line).not.toMatch(/lose|lost|break|miss/i);
  });

  // Playtest 2026-11-08b, finding 11: "1001-day streak".
  it('groups a four-digit streak', () => {
    const copy = streakCopy(status({ streak: 1001, today: 3, todayCounts: true, nextCheckpoint: 1095 }));
    expect(copy?.headline).toMatch(/^1\D001-day streak$/);
    expect(copy?.detail).toMatch(/Next milestone: 1\D095 days/);
  });
});

// Roadmap D60 (e): an ended streak is said for a week while none runs, as a
// fresh start (blind playtest 2026-11-13b, run 3).
describe('streakCopy — a streak that ended', () => {
  it('says it ended yesterday, with no rest day to cover it, and no goal dots', () => {
    const copy = streakCopy(
      status({
        streak: 0,
        today: 0,
        todayCounts: false,
        ended: { days: 151, on: '2026-11-12T00:00:00', ago: 1 },
      }),
    );
    expect(copy).toMatchObject({
      headline: 'Your 151-day streak ended yesterday',
      detail: 'No rest day was left to cover it. One prediction today starts a new one',
      filled: 0,
      ended: true,
      rest: null,
    });
    expect(copy?.spoken).toBe(
      'Your 151-day streak ended yesterday. No rest day was left to cover it. One prediction today starts a new one.',
    );
  });

  it('names the weekday further back', () => {
    const on = new Date(2026, 10, 12); // a Thursday
    const copy = streakCopy(
      status({ streak: 0, today: 0, todayCounts: false, ended: { days: 9, on: on.toISOString(), ago: 3 } }),
    );
    expect(copy?.headline).toBe(
      `Your 9-day streak ended on ${on.toLocaleDateString(undefined, { weekday: 'long' })}`,
    );
  });
});
