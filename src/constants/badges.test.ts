import { nextBadge } from '@/engine/calibration';

import { BADGE_CHIP_COLORS, BADGE_META, BADGE_SCORE_BAR, CHIP_EMBLEM_INVERTED } from './badges';
import { contrastRatio } from './contrast';
import { palettes } from './theme';

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

// Roadmap D80 (the owner, 2026-11-25): medals, by the ids that are stored.
describe('badge names', () => {
  it('reads as medals, the ids unchanged', () => {
    expect(Object.fromEntries(Object.entries(BADGE_META).map(([id, m]) => [id, m.label]))).toEqual({
      guesser: 'Getting started',
      tracker: 'Bronze',
      forecaster: 'Silver',
      sharp: 'Gold',
      oracle: 'Platinum',
    });
  });

  it('never says "sharp", in any sense', () => {
    for (const meta of Object.values(BADGE_META)) {
      expect(`${meta.label} ${meta.tagline}`).not.toMatch(/sharp/i);
    }
  });
});

// D80's colours: Platinum is the strongest chip, and every emblem's face
// shows on its own chip (a non-text graphic, 3:1), in both appearances. An
// ink face on an ink chip vanished once (D33), so Platinum's emblem takes the
// other appearance's tones there.
describe('badge chips and their emblems', () => {
  const schemes = ['light', 'dark'] as const;

  it('makes Platinum the strongest chip', () => {
    for (const scheme of schemes) {
      const ratio = (tier: keyof typeof BADGE_CHIP_COLORS) =>
        contrastRatio(BADGE_CHIP_COLORS[tier][scheme].color, BADGE_CHIP_COLORS[tier][scheme].background);
      for (const tier of ['guesser', 'tracker', 'forecaster', 'sharp'] as const) {
        expect([scheme, tier, ratio('oracle') > ratio(tier)]).toEqual([scheme, tier, true]);
      }
      // Set apart from the screen it sits on, too.
      expect(contrastRatio(BADGE_CHIP_COLORS.oracle[scheme].background, palettes[scheme].surface)).toBeGreaterThan(10);
    }
  });

  it('takes no hue that means a lean', () => {
    // Gold's chip is the one warm tint; nothing blue or green, no orange.
    for (const [tier, pair] of Object.entries(BADGE_CHIP_COLORS)) {
      for (const scheme of schemes) {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(pair[scheme].background.slice(i, i + 2), 16));
        if (tier !== 'sharp') expect([tier, scheme, Math.max(r, g, b) - Math.min(r, g, b) < 20]).toEqual([tier, scheme, true]);
        else expect([tier, scheme, b <= g && g <= r]).toEqual([tier, scheme, true]);
      }
    }
  });

  it('shows Gold and Platinum faces, and their gold edges, on their own chips', () => {
    for (const scheme of schemes) {
      const own = palettes[scheme];
      const other = palettes[scheme === 'light' ? 'dark' : 'light'];
      const gold = BADGE_CHIP_COLORS.sharp[scheme].background;
      expect(contrastRatio(own.emblemDeep, gold)).toBeGreaterThanOrEqual(3);
      const ink = BADGE_CHIP_COLORS.oracle[scheme].background;
      expect(CHIP_EMBLEM_INVERTED.has('oracle')).toBe(true);
      // In the screen's own tones the face would vanish into the chip...
      expect(contrastRatio(own.emblemDeep, ink)).toBeLessThan(1.5);
      // ...so it takes the other appearance's: face and gold edge both show.
      expect(contrastRatio(other.emblemDeep, ink)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(other.medalGold, ink)).toBeGreaterThanOrEqual(3);
    }
  });
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
