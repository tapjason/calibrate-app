import { welcomeBackLines } from './welcomeBackCopy';

const gap = { awayDays: 63, lastActiveAt: '2026-09-07T20:00:00.000Z', endedStreak: 34 };

// Roadmap D51 (blind playtest 2026-11-09b, finding 4), in D76's words (the
// voice pass, 2026-11-23): "Welcome back. 2 predictions are waiting. Go with
// what you remember." The card's title says "Welcome back".
describe('welcomeBackLines', () => {
  it('says what is waiting, the rating and the streak', () => {
    expect(welcomeBackLines({ gap, ready: 12, todayCounts: false, rated: true })).toEqual([
      '12 predictions are waiting. Go with what you remember.',
      'Your rating moves as you answer them.',
      'Your 34-day streak ended while you were away. One prediction today starts a new one.',
    ]);
  });

  it('says when nothing is waiting, and leaves out what is not there', () => {
    expect(
      welcomeBackLines({ gap: { ...gap, endedStreak: 1 }, ready: 0, todayCounts: false, rated: true }),
    ).toEqual(['Nothing is waiting to be answered.']);
  });

  it('says a new streak has started once today counts', () => {
    const lines = welcomeBackLines({ gap, ready: 1, todayCounts: true, rated: false });
    expect(lines[0]).toBe('One prediction is waiting. Go with what you remember.');
    expect(lines.at(-1)).toMatch(/Today started a new one\.$/);
    expect(lines.join(' ')).not.toMatch(/rating/);
  });

  it('says the rating moves as one answer comes in, in the singular', () => {
    expect(welcomeBackLines({ gap, ready: 1, todayCounts: false, rated: true })[1]).toBe(
      'Your rating moves as you answer it.',
    );
  });

  it('never says the streak was lost', () => {
    const lines = welcomeBackLines({ gap, ready: 2, todayCounts: false, rated: true });
    expect(lines.join(' ')).not.toMatch(/lose|lost|broke|miss/i);
  });
});
