import { clampPicked, localNoonIso } from './DuePicker';

describe('localNoonIso', () => {
  // Anchored at local noon, like the presets, so the UTC timestamp falls on
  // the same calendar day in every zone from UTC-12 to UTC+12.
  it('lands on local noon of the chosen day', () => {
    const d = new Date(localNoonIso(2026, 9, 3));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([
      2026, 9, 3, 12,
    ]);
  });
});

// A typed date gets past a web date field's min and max (blind playtests
// 2026-11-04 and 2026-11-08, which typed 1906 and 9999).
describe('clampPicked', () => {
  const earliest = new Date(2026, 10, 9);
  const latest = new Date(2028, 10, 8);

  it('keeps a day inside the range', () => {
    const day = new Date(2027, 0, 5);
    expect(clampPicked(day, earliest, latest)).toBe(day);
  });

  it('moves an early day to the earliest and a late one to the latest', () => {
    expect(clampPicked(new Date(1906, 10, 5), earliest, latest)).toBe(earliest);
    expect(clampPicked(new Date(9999, 11, 31), earliest, latest)).toBe(latest);
  });
});
