import { keepsPinned } from './usePinnedFooter';

// Blind playtests 2026-11-12b to -12d: at large text the pinned bar took a
// third of a small screen.
describe('keepsPinned', () => {
  it('pins a footer up to a quarter of the screen', () => {
    expect(keepsPinned(100, 568, true)).toBe(true);
    expect(keepsPinned(142, 568, true)).toBe(true);
    expect(keepsPinned(143, 568, true)).toBe(false);
    expect(keepsPinned(222, 812, true)).toBe(false);
  });

  // Code review 2026-11-12: "Still needed…" coming and going moved Save.
  it('once let go, stays in the scroll while the screen is open', () => {
    expect(keepsPinned(60, 568, false)).toBe(false);
  });

  it('stays pinned before anything is measured', () => {
    expect(keepsPinned(0, 568, true)).toBe(true);
  });
});
