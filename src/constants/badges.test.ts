import { nextBadge } from '@/engine/calibration';

import { BADGE_SCORE_BAR } from './badges';

// The copy's bars (step 173) are the engine's.
describe('BADGE_SCORE_BAR', () => {
  it('matches the engine’s requirements', () => {
    expect(nextBadge(0, 0)?.needScore ?? null).toBeNull(); // tracker: count only
    expect(nextBadge(20, 60)?.needScore).toBe(BADGE_SCORE_BAR.forecaster);
    expect(nextBadge(50, 80)?.needScore).toBe(BADGE_SCORE_BAR.sharp);
    expect(nextBadge(100, 88)?.needScore).toBe(BADGE_SCORE_BAR.oracle);
  });
});
