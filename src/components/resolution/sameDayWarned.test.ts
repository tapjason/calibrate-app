import { sameDayHeadsUp, sameDayWarned, warnedKey } from './sameDayWarned';

// Roadmap D56: Resolve skips its same-day note only straight after Answer it
// now's confirmation said it, on the same local day.
describe('sameDayWarned', () => {
  const now = new Date(2026, 10, 10, 21, 30); // Tue 10 Nov, 9:30 PM local
  const yesterday = new Date(2026, 10, 9, 21, 30);

  it('keys the local day with no spaces', () => {
    expect(warnedKey(now)).toBe('2026-11-10');
    expect(warnedKey(new Date(2027, 0, 4, 0, 5))).toBe('2027-01-04');
  });

  it("is true only for today's key, encoded or not, or first in an array", () => {
    expect(sameDayWarned('2026-11-10', now)).toBe(true);
    expect(sameDayWarned(encodeURIComponent('2026-11-10'), now)).toBe(true);
    expect(sameDayWarned(['2026-11-10', 'x'], now)).toBe(true);
  });

  it("is false for yesterday's key, nothing, or anything malformed", () => {
    expect(sameDayWarned(warnedKey(yesterday), now)).toBe(false);
    expect(sameDayWarned(undefined, now)).toBe(false);
    expect(sameDayWarned('', now)).toBe(false);
    expect(sameDayWarned('%E0%A4%A', now)).toBe(false);
    expect(sameDayWarned('Tue Nov 10 2026', now)).toBe(false);
  });
});

// Record audit 2026-11-23: "won't be scored", not "won't count", since a
// same-day answer still keeps the streak; the same for a rewording.
describe('sameDayHeadsUp', () => {
  it('says the answer won’t be scored, logged or reworded', () => {
    expect(sameDayHeadsUp(false)).toBe(
      'Heads up: an answer today won’t be scored, because you logged it today. Tomorrow it will.',
    );
    expect(sameDayHeadsUp(true)).toBe(
      'Heads up: an answer today won’t be scored, because you reworded it today. Tomorrow it will.',
    );
    expect(sameDayHeadsUp(false)).not.toMatch(/count/);
  });
});
