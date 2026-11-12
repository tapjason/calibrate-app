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

  it('pins again only under a fifth, so it cannot flicker', () => {
    expect(keepsPinned(130, 568, false)).toBe(false);
    expect(keepsPinned(113, 568, false)).toBe(true);
  });

  it('keeps what it had before anything is measured', () => {
    expect(keepsPinned(0, 568, true)).toBe(true);
    expect(keepsPinned(0, 568, false)).toBe(false);
  });
});
