import { dueWords } from './dueWords';

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
