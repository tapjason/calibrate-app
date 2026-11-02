import { wholeMonthsSince } from './wholeMonthsSince';

// Local dates, as the app reads them.
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

describe('wholeMonthsSince', () => {
  // Blind playtest 2026-11-01: data since May 9 read "7 months on file" on
  // November 1, and one answer today read "1 month".
  it('counts whole months, not calendar months touched', () => {
    expect(wholeMonthsSince(at(2026, 5, 9).toISOString(), at(2026, 11, 1))).toBe(5);
    expect(wholeMonthsSince(at(2026, 11, 1).toISOString(), at(2026, 11, 1))).toBe(0);
  });

  it('counts a month on the same day of the next month', () => {
    expect(wholeMonthsSince(at(2026, 10, 1).toISOString(), at(2026, 10, 31))).toBe(0);
    expect(wholeMonthsSince(at(2026, 10, 1).toISOString(), at(2026, 11, 1))).toBe(1);
  });

  it('crosses a year', () => {
    expect(wholeMonthsSince(at(2025, 11, 20).toISOString(), at(2026, 2, 20))).toBe(3);
  });

  it('is 0 with nothing on file, or a date it cannot read', () => {
    expect(wholeMonthsSince(null, at(2026, 11, 1))).toBe(0);
    expect(wholeMonthsSince('not a date', at(2026, 11, 1))).toBe(0);
  });
});
