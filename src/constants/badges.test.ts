import { nextBadge } from '@/engine/calibration';

import { BADGE_CHIP_COLORS, BADGE_SCORE_BAR } from './badges';
import { contrastRatio } from './contrast';

// DESIGN_SYSTEM §0 rule 7: a chip's label is text, so ≥ 4.5:1 on its fill,
// in both appearances (roadmap D7).
describe('badge chip colours', () => {
  for (const [tier, schemes] of Object.entries(BADGE_CHIP_COLORS)) {
    for (const [scheme, { color, background }] of Object.entries(schemes)) {
      it(`${tier} reads at 4.5:1 or better in ${scheme}`, () => {
        expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

// The copy's bars (step 173) are the engine's.
describe('BADGE_SCORE_BAR', () => {
  it('matches the engine’s requirements', () => {
    expect(nextBadge(0, 0)?.needScore ?? null).toBeNull(); // tracker: count only
    expect(nextBadge(20, 60)?.needScore).toBe(BADGE_SCORE_BAR.forecaster);
    expect(nextBadge(50, 80)?.needScore).toBe(BADGE_SCORE_BAR.sharp);
    expect(nextBadge(100, 88)?.needScore).toBe(BADGE_SCORE_BAR.oracle);
  });
});
