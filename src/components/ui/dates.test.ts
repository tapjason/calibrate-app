import { __setDeviceLocaleForTests } from '@/constants/locale';

import { dateWithWeekday, localDate, localDaysFrom, relativeDay } from './dates';

const now = new Date(2026, 10, 8, 12);

// Playtest 2026-11-08, finding 6: no date showed its year.
describe('localDate', () => {
  it('leaves the year off a date this year', () => {
    const label = localDate(new Date(2026, 11, 31, 12), { month: 'short', day: 'numeric' }, now);
    expect(label).not.toMatch(/2026/);
  });

  it('adds the year to a date in another year', () => {
    expect(localDate(new Date(2027, 11, 31, 12), { month: 'short', day: 'numeric' }, now)).toMatch(
      /2027/,
    );
    expect(localDate(new Date(2025, 10, 3, 12), { month: 'short', day: 'numeric' }, now)).toMatch(
      /2025/,
    );
  });
});

describe('localDaysFrom', () => {
  it('counts calendar days, not 24-hour periods', () => {
    const lateNight = new Date(2026, 10, 24, 23, 59);
    expect(localDaysFrom(lateNight, new Date(2026, 10, 25, 0, 1))).toBe(1);
    expect(localDaysFrom(new Date(2026, 10, 25, 0, 1), lateNight)).toBe(-1);
    expect(localDaysFrom(new Date(2026, 10, 24, 0, 0), lateNight)).toBe(0);
  });

  it('crosses months and years', () => {
    expect(localDaysFrom(new Date(2026, 11, 31, 12), new Date(2027, 0, 1, 12))).toBe(1);
    expect(localDaysFrom(new Date(2026, 1, 28, 12), new Date(2026, 2, 1, 12))).toBe(1);
  });
});

// The owner, 2026-11-24: "Due in * days makes the most sense, but for dates
// further out … Due Nov 21 (Friday). For the ones within 7 days it makes
// sense to not show the full date at least."
describe('relativeDay', () => {
  // Tuesday 24 November 2026, 9 PM local; due dates sit at local noon.
  const at = new Date(2026, 10, 24, 21, 0);
  const noon = (y: number, m: number, d: number) => new Date(y, m, d, 12);
  const words = (d: Date) => relativeDay(d, at).spoken;

  afterEach(() => __setDeviceLocaleForTests(null));

  it('names today, tomorrow and yesterday', () => {
    expect(words(noon(2026, 10, 24))).toBe('today');
    expect(words(noon(2026, 10, 25))).toBe('tomorrow');
    expect(words(noon(2026, 10, 23))).toBe('yesterday');
  });

  it('counts the days from two to seven, either way', () => {
    expect(words(noon(2026, 10, 26))).toBe('in 2 days');
    expect(words(noon(2026, 11, 1))).toBe('in 7 days');
    expect(words(noon(2026, 10, 22))).toBe('2 days ago');
    expect(words(noon(2026, 10, 17))).toBe('7 days ago');
  });

  it('gives the date and its weekday from the eighth day on, either way', () => {
    expect(words(noon(2026, 11, 2))).toBe('Dec 2 (Wednesday)');
    expect(words(noon(2026, 10, 16))).toBe('Nov 16 (Monday)');
    expect(words(noon(2026, 11, 25))).toBe('Dec 25 (Friday)');
  });

  it('adds the year only when it is not this one', () => {
    expect(words(noon(2027, 0, 5))).toBe('Jan 5, 2027 (Tuesday)');
    expect(words(noon(2025, 10, 21))).toBe('Nov 21, 2025 (Friday)');
  });

  // A day-first phone in another language (D63): English words in its order.
  // (A phone already in English keeps its own locale, Node's US one here.)
  it("keeps a day-first phone's order, in English", () => {
    __setDeviceLocaleForTests('de-DE');
    expect(words(noon(2026, 11, 2))).toBe('2 Dec (Wednesday)');
    expect(words(noon(2027, 0, 5))).toBe('5 Jan 2027 (Tuesday)');
    __setDeviceLocaleForTests('nl-NL');
    expect(words(noon(2026, 11, 2))).toBe('2 Dec (Wednesday)');
    // The relative words don't depend on the order.
    expect(words(noon(2026, 10, 27))).toBe('in 3 days');
  });

  it('holds the words together on screen, breaking only before the bracket', () => {
    expect(relativeDay(noon(2026, 10, 27), at).text).toBe('in 3 days');
    expect(relativeDay(noon(2026, 10, 21), at).text).toBe('3 days ago');
    expect(relativeDay(noon(2026, 11, 2), at).text).toBe('Dec 2 (Wednesday)');
    expect(relativeDay(noon(2027, 0, 5), at).text).toBe('Jan 5, 2027 (Tuesday)');
  });

  it('counts by the calendar near midnight', () => {
    const late = new Date(2026, 10, 24, 23, 59);
    expect(relativeDay(new Date(2026, 10, 25, 0, 1), late).spoken).toBe('tomorrow');
    const early = new Date(2026, 10, 25, 0, 1);
    expect(relativeDay(new Date(2026, 10, 24, 23, 59), early).spoken).toBe('yesterday');
  });
});

describe('dateWithWeekday', () => {
  it('reads month, day and weekday, with plain spaces', () => {
    expect(dateWithWeekday(new Date(2026, 10, 21, 12), now)).toBe('Nov 21 (Saturday)');
  });
});
