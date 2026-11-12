import { dueWords, loggedAgainLine, savedLine, logAgainWords, repeatDueWords } from './dueWords';

// Roadmap D55: Save names the date ("Save, due Sunday").
describe('dueWords', () => {
  // Monday 9 November 2026, 9 PM local.
  const now = new Date(2026, 10, 9, 21, 0, 0);
  const noon = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();

  it('says "tomorrow" for the next day', () => {
    expect(dueWords(noon(2026, 10, 10), now)).toEqual({ text: 'tomorrow', spoken: 'tomorrow' });
  });

  it('says the weekday from two to six days out', () => {
    const sunday = dueWords(noon(2026, 10, 15), now);
    expect(sunday.text).toMatch(/Sunday/);
    expect(sunday.spoken).toBe(sunday.text);
    expect(dueWords(noon(2026, 10, 11), now).text).toMatch(/Wednesday/);
  });

  it('says the short date from a week on, held together, and spells it out to VoiceOver', () => {
    const week = dueWords(noon(2026, 10, 16), now);
    expect(week.text).toMatch(/Mon/);
    expect(week.text).toMatch(/16/);
    // Held together, except after the weekday's comma, where a long label may break.
    expect(week.text.replace(', ', '')).not.toMatch(/ /);
    expect(week.spoken).toMatch(/Monday/);
    expect(week.spoken).toMatch(/November/);
  });

  it('adds the year when it is not this one', () => {
    const next = dueWords(noon(2027, 0, 4), now).text;
    expect(next).toMatch(/2027/);
    // At most one breakable space: after the weekday's comma.
    expect((next.match(/ /g) ?? []).length).toBeLessThanOrEqual(1);
    expect(dueWords(noon(2026, 11, 1), now).text).not.toMatch(/2026/);
  });
});

// Roadmap D56: "Log it again, due tomorrow"; a week or a month as the chips say it.
describe('repeatDueWords and logAgainWords', () => {
  const now = new Date(2026, 10, 9, 21, 0, 0);
  const noon = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();

  it('names a week and a month as the chips do, else as Save says it', () => {
    expect(repeatDueWords(noon(2026, 10, 16), now).text).toBe('in a week');
    expect(repeatDueWords(noon(2026, 11, 9), now).text).toBe('in a month');
    expect(repeatDueWords(noon(2026, 10, 10), now).text).toBe('tomorrow');
    expect(repeatDueWords(noon(2026, 10, 12), now).text).toMatch(/Thursday/);
  });

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
    expect(logAgainWords(p, now).text).toBe('in a week');
    expect(logAgainWords({ ...p, created_at: new Date(2026, 10, 8, 20).toISOString() }, now).text).toBe(
      'tomorrow',
    );
  });
});

describe('loggedAgainLine', () => {
  const now = new Date(2026, 10, 9, 21, 0, 0);
  const noon = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();

  it('names the day ahead, and says ready to answer once it has come', () => {
    expect(loggedAgainLine(noon(2026, 10, 10), now)).toBe('Logged again, due tomorrow.');
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
    expect(savedLine(noon(2026, 10, 12), now)).toMatch(/^Saved, due Thursday\.$/);
    expect(savedLine(noon(2026, 10, 9), now)).toBe('Saved, ready to answer.');
  });
});
