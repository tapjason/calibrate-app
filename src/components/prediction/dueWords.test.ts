import { dueWords, loggedAgainLine, savedLine, logAgainWords } from './dueWords';

// Roadmap D55: Save names the date. In the owner's words since 2026-11-24:
// "Save, due in 3 days", "Save, due Nov 21 (Friday)".
describe('dueWords', () => {
  // Monday 9 November 2026, 9 PM local.
  const now = new Date(2026, 10, 9, 21, 0, 0);
  const noon = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();

  it('says "tomorrow" for the next day', () => {
    expect(dueWords(noon(2026, 10, 10), now)).toEqual({ text: 'tomorrow', spoken: 'tomorrow' });
  });

  it('counts the days from two to seven, held together on screen', () => {
    const sunday = dueWords(noon(2026, 10, 15), now);
    expect(sunday.spoken).toBe('in 6 days');
    expect(sunday.text).toBe('in 6 days');
    expect(dueWords(noon(2026, 10, 11), now).spoken).toBe('in 2 days');
    expect(dueWords(noon(2026, 10, 16), now).spoken).toBe('in 7 days');
  });

  it('gives the date and its weekday from the eighth day, breaking only before the bracket', () => {
    const later = dueWords(noon(2026, 10, 17), now);
    expect(later.spoken).toBe('Nov 17 (Tuesday)');
    expect(later.text).toBe('Nov 17 (Tuesday)');
  });

  it('adds the year when it is not this one', () => {
    const next = dueWords(noon(2027, 0, 4), now);
    expect(next.spoken).toBe('Jan 4, 2027 (Monday)');
    // One breakable space: before the weekday's bracket.
    expect((next.text.match(/ /g) ?? []).length).toBe(1);
    expect(dueWords(noon(2026, 11, 1), now).text).not.toMatch(/2026/);
  });
});

// Roadmap D56: "Log it again, due tomorrow", in Save's words.
describe('logAgainWords', () => {
  const now = new Date(2026, 10, 9, 21, 0, 0);

  it('reads the date Log will open with: the lead time from today', () => {
    const p = {
      id: 'a1',
      user_id: 'u1',
      title: 'Walk 30 minutes',
      category: 'health' as const,
      confidence: 90,
      created_at: new Date(2026, 10, 2, 8, 5).toISOString(),
      due_date: new Date(2026, 10, 9, 12).toISOString(), // logged a week ahead
      status: 'resolved_yes' as const,
      resolved_at: new Date(2026, 10, 9, 19).toISOString(),
      reflection: null,
      integrity_bonus: false,
    };
    expect(logAgainWords(p, now).spoken).toBe('in 7 days');
    expect(logAgainWords({ ...p, created_at: new Date(2026, 10, 8, 20).toISOString() }, now).text).toBe(
      'tomorrow',
    );
    // A month ahead: the date, as Save says it.
    expect(
      logAgainWords({ ...p, created_at: new Date(2026, 9, 10, 8).toISOString() }, now).spoken,
    ).toBe('Dec 9 (Wednesday)');
  });
});

describe('loggedAgainLine', () => {
  const now = new Date(2026, 10, 9, 21, 0, 0);
  const noon = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();

  it('names the day ahead, and says ready to answer once it has come', () => {
    expect(loggedAgainLine(noon(2026, 10, 10), now)).toBe('Logged again, due tomorrow.');
    expect(loggedAgainLine(noon(2026, 10, 12), now)).toBe('Logged again, due in 3 days.');
    expect(loggedAgainLine(noon(2026, 10, 9), now)).toBe('Logged again, ready to answer.');
    expect(loggedAgainLine(noon(2026, 10, 7), now)).toBe('Logged again, ready to answer.');
    expect(dueWords(noon(2026, 10, 9), now).text).toBe('today');
  });
});

describe('savedLine', () => {
  const now = new Date(2026, 10, 9, 21, 0, 0);
  const noon = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();

  it('says the save worked and when it comes due', () => {
    expect(savedLine(noon(2026, 10, 10), now)).toBe('Saved, due tomorrow.');
    expect(savedLine(noon(2026, 10, 12), now)).toBe('Saved, due in 3 days.');
    expect(savedLine(noon(2026, 10, 30), now)).toBe('Saved, due Nov 30 (Monday).');
    expect(savedLine(noon(2026, 10, 9), now)).toBe('Saved, ready to answer.');
  });
});
