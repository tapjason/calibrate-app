import { revealScrollY } from './useScrollReveal';

// Blind playtest 2026-11-12e, findings 3 and 4: the confidence control under
// a pinned bar. The scroll that brings it into view goes no further than
// needed, and only down.
describe('revealScrollY', () => {
  const at = (p: Partial<Parameters<typeof revealScrollY>[0]>) =>
    revealScrollY({ top: 500, bottom: 620, scrollY: 0, viewport: 500, margin: 16, ...p });

  it('scrolls just far enough to show the bottom, with a margin', () => {
    expect(at({})).toBe(620 - 500 + 16);
  });

  it('leaves a block whose bottom already shows', () => {
    expect(at({ viewport: 700 })).toBeNull();
    expect(at({ scrollY: 200 })).toBeNull();
  });

  it('shows a block taller than the view from its top', () => {
    expect(at({ top: 100, bottom: 900 })).toBe(100);
  });

  it('never scrolls up', () => {
    // Already past the top of a tall block: left where it is.
    expect(at({ top: 100, bottom: 900, scrollY: 150 })).toBeNull();
  });

  it('does nothing before the layout is known', () => {
    expect(at({ viewport: 0 })).toBeNull();
    expect(at({ top: 0, bottom: 0 })).toBeNull();
  });
});
