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
      detail: 'Today counts. Goal: 1 of 3',
      filled: 1,
      checkpoint: false,
    });
  });

  it('says when the goal is met, what the next milestone is, and never overfills the pips', () => {
    expect(
      streakCopy(status({ streak: 13, today: 5, todayCounts: true, nextCheckpoint: 30 })),
    ).toMatchObject({
      detail: "Today's goal met. Next\u00A0milestone: 30\u00A0days",
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
      detail: 'A full week. Next\u00A0milestone: 30\u00A0days',
      filled: 3,
      spoken: '7-day streak. A full week. Next\u00A0milestone: 30\u00A0days.',
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
      body: 'Next\u00A0milestone: 365\u00A0days.',
      spoken: '100-day streak. Triple digits. Next\u00A0milestone: 365\u00A0days.',
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
      detail: 'A full week. Next\u00A0milestone: 30\u00A0days',
      rest: 'Today saved a rest day',
    });
    expect(running({ restDays: 2, restEarnedToday: true })?.rest).toBe('Today saved a second rest day');
  });

  it('says a spent one first, as a relief', () => {
    expect(running({ restUsed: 1, nextRestAt: 14 })?.rest).toBe('Yesterday was a rest day');
    expect(running({ restUsed: 1, restDays: 1 })?.rest).toBe('Yesterday was a rest day. 1 more saved');
    expect(running({ restUsed: 2, nextRestAt: 14 })?.rest).toBe('The last 2 days were rest days');
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
});
