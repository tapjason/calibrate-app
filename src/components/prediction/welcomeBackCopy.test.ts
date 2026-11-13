import { awayFor, welcomeBackLines } from './welcomeBackCopy';

const gap = { awayDays: 63, lastActiveAt: '2026-09-07T20:00:00.000Z', endedStreak: 34 };

describe('awayFor', () => {
  it('rounds down to weeks, then months', () => {
    expect(awayFor(14)).toBe('2 weeks');
    expect(awayFor(59)).toBe('8 weeks');
    expect(awayFor(63)).toBe('2 months');
  });
});

// Roadmap D51 (blind playtest 2026-11-09b, finding 4).
describe('welcomeBackLines', () => {
  it('says the gap, what is waiting, the rating and the streak', () => {
    expect(welcomeBackLines({ gap, ready: 12, todayCounts: false, rated: true })).toEqual([
      'It’s been 2 months since you last logged, answered or practised.',
      '12 predictions are ready to answer. Answer what you remember about each.',
      'Your rating moves as you answer them.',
      'Your 34-day streak ended while you were away. One prediction today starts a new one.',
    ]);
  });

  it('leaves out what is not there', () => {
    expect(
      welcomeBackLines({ gap: { ...gap, endedStreak: 1 }, ready: 0, todayCounts: false, rated: true }),
    ).toEqual(['It’s been 2 months since you last logged, answered or practised.']);
  });

  it('says it in the past once something is done today', () => {
    expect(welcomeBackLines({ gap, ready: 0, todayCounts: true, rated: false, activeToday: true })[0]).toBe(
      'It had been 2 months since you last logged, answered or practised.',
    );
  });

  it('says a new streak has started once today counts', () => {
    const lines = welcomeBackLines({ gap, ready: 1, todayCounts: true, rated: false });
    expect(lines[1]).toBe('One prediction is ready to answer. Answer what you remember about it.');
    expect(lines.at(-1)).toMatch(/Today started a new one\.$/);
    expect(lines.join(' ')).not.toMatch(/rating/);
  });
});
