import type { StreakStatus } from '@/types';

import { checkpointCopy, checkpointName, streakCopy } from './streakCopy';

/** A status with the engine's checkpoint fields filled in plainly. */
const status = (s: Partial<StreakStatus> & Pick<StreakStatus, 'streak' | 'today' | 'todayCounts'>): StreakStatus => ({
  checkpoint: null,
  nextCheckpoint: 7,
  ...s,
});

// Roadmap D2: days, with three logged or answered to count, and the line says
// what today adds rather than what it would cost.
describe('streakCopy', () => {
  it('stays hidden with no streak and nothing today', () => {
    expect(streakCopy(status({ streak: 0, today: 0, todayCounts: false }))).toBeNull();
  });

  it('says how many more start a streak', () => {
    expect(streakCopy(status({ streak: 0, today: 1, todayCounts: false }))).toMatchObject({
      headline: '2 more today starts a streak',
      detail: null,
      filled: 1,
      checkpoint: false,
    });
  });

  it('says what today adds to a running streak', () => {
    expect(
      streakCopy(status({ streak: 12, today: 2, todayCounts: false, nextCheckpoint: 30 })),
    ).toMatchObject({
      headline: '12-day streak',
      detail: '1 more today makes it 13',
      filled: 2,
      spoken: '12-day streak. 1 more today makes it 13.',
    });
  });

  it('says when today already counts, what the next milestone is, and never overfills the pips', () => {
    expect(
      streakCopy(status({ streak: 13, today: 5, todayCounts: true, nextCheckpoint: 30 })),
    ).toMatchObject({
      headline: '13-day streak',
      detail: 'Today counts. Next\u00A0milestone: 30\u00A0days',
      filled: 3,
      checkpoint: false,
    });
  });

  it('never talks about losing it', () => {
    const lines = [
      streakCopy(status({ streak: 1, today: 0, todayCounts: false })),
      streakCopy(status({ streak: 0, today: 2, todayCounts: false })),
      streakCopy(status({ streak: 6, today: 0, todayCounts: false })),
    ].map((c) => `${c?.headline} ${c?.detail ?? ''}`);
    for (const line of lines) expect(line).not.toMatch(/lose|lost|break|miss/i);
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
    });
  });

  it('says so the day before, as a gain', () => {
    expect(
      streakCopy(status({ streak: 29, today: 1, todayCounts: false, nextCheckpoint: 30 }))?.detail,
    ).toBe('2 more today makes it 30: a full month');
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
