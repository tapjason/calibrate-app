import { BADGE_CHIP_COLORS } from './badges';
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
