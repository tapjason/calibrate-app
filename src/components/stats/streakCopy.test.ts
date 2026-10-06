import { streakCopy } from './streakCopy';

// Roadmap D2: days, with three logged or answered to count, and the line says
// what today adds rather than what it would cost.
describe('streakCopy', () => {
  it('stays hidden with no streak and nothing today', () => {
    expect(streakCopy({ streak: 0, today: 0, todayCounts: false })).toBeNull();
  });

  it('says how many more start a streak', () => {
    expect(streakCopy({ streak: 0, today: 1, todayCounts: false })).toMatchObject({
      headline: '2 more today starts a streak',
      detail: null,
      filled: 1,
    });
  });

  it('says what today adds to a running streak', () => {
    expect(streakCopy({ streak: 12, today: 2, todayCounts: false })).toMatchObject({
      headline: '12-day streak',
      detail: '1 more today makes it 13',
      filled: 2,
      spoken: '12-day streak. 1 more today makes it 13.',
    });
  });

  it('says when today already counts, and never overfills the pips', () => {
    expect(streakCopy({ streak: 13, today: 5, todayCounts: true })).toMatchObject({
      headline: '13-day streak',
      detail: 'Today counts',
      filled: 3,
    });
  });

  it('never talks about losing it', () => {
    const lines = [
      streakCopy({ streak: 1, today: 0, todayCounts: false }),
      streakCopy({ streak: 0, today: 2, todayCounts: false }),
    ].map((c) => `${c?.headline} ${c?.detail ?? ''}`);
    for (const line of lines) expect(line).not.toMatch(/lose|lost|break|miss/i);
  });
});
