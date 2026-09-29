import { localNoonIso } from './DuePicker';

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
