import { localDate } from './dates';

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
