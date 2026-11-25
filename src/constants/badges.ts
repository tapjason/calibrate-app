import type { BadgeLevel } from '@/types';

import { themed } from './theme';

/**
 * Display metadata for each per-category badge level. The criteria live in the
 * engine (`evaluateBadge`) — this is presentation only: the label and colors
 * used to render a badge chip. The emblem itself is `LensEmblem`; there are
 * no emoji (DESIGN_SYSTEM §5: they render differently per platform and read
 * as toys). `tagline` is a one-line description of
 * what the level means, shown in the badge legend.
 *
 * The labels are medals since roadmap D80 (the owner, 2026-11-25): Bronze,
 * Silver, Gold and Platinum, read at a glance, where Tracker, Forecaster,
 * Sharp and Oracle had to be learned. Display names only: the ids, the
 * engine's bars and everything stored or synced keep the old ids.
 */
export interface BadgeMeta {
  label: string;
  /** Foreground / accent color for the chip text. Follows the appearance (D7). */
  color: string;
  /** Chip background. Follows the appearance (D7). */
  background: string;
  tagline: string;
}

/**
 * The chip's ink and fill, light and dark (roadmap D7). Every pair is held to
 * 4.5:1 by badges.test.ts.
 *
 * A grey ladder (roadmap D33), each tier a step darker than the one below,
 * for Getting started, Bronze and Silver; gold for Gold; and the app's own
 * ink for Platinum, the strongest chip (D80). No bronze or brown, orange,
 * blue or green: those hues mean too sure, too cautious and on the line, and
 * the brand has none of its own. Tier is carried by the emblem's rings and
 * the written label, never colour alone.
 *
 * Platinum's chip is `action`'s ink in each appearance (dark on light, light
 * on dark). Its emblem's face is ink too, and on an ink chip it vanished
 * (until D80 the top grey stopped at a mid grey for that reason), so on its
 * chip the emblem takes the other appearance's tones (`paletteOnInk`,
 * `CHIP_EMBLEM_INVERTED`).
 */
export const BADGE_CHIP_COLORS: Record<
  BadgeLevel,
  Record<'light' | 'dark', { color: string; background: string }>
> = {
  guesser: {
    light: { color: '#5E626C', background: '#EEF0F2' }, // 5.34:1
    dark: { color: '#9599A3', background: '#1C1E22' }, // 5.85:1
  },
  tracker: {
    light: { color: '#4B4F58', background: '#E6E8EB' }, // 6.69:1
    dark: { color: '#B4B8C0', background: '#24262B' }, // 7.61:1
  },
  forecaster: {
    light: { color: '#24272D', background: '#D8DBE0' }, // 10.8:1
    dark: { color: '#E1E3E7', background: '#33363D' }, // 9.42:1
  },
  sharp: {
    light: { color: '#6B4510', background: '#F7ECD3' }, // 7.20:1
    dark: { color: '#E8B64C', background: '#2A1E08' }, // 8.72:1
  },
  oracle: {
    light: { color: '#FFFFFF', background: '#15171B' }, // 17.9:1
    dark: { color: '#15171B', background: '#F2F3F5' }, // 16.2:1
  },
};

/**
 * The tiers whose emblem, on their own chip, takes the other appearance's
 * tones (D80). badges.test.ts holds the emblem's face to 3:1 on the chip.
 */
export const CHIP_EMBLEM_INVERTED: ReadonlySet<BadgeLevel> = new Set<BadgeLevel>(['oracle']);

function chipColor(tier: BadgeLevel, part: 'color' | 'background'): string {
  const { light, dark } = BADGE_CHIP_COLORS[tier];
  return themed(`badge-${tier}-${part}`, light[part], dark[part]);
}

export const BADGE_META: Record<BadgeLevel, BadgeMeta> = {
  guesser: {
    // 'Getting started' since roadmap D36 (2026-11-01): 'Guesser' stung after one
    // prediction (blind playtest runs 1 and 2). The id stays 'guesser'.
    label: 'Getting started',
    color: chipColor('guesser', 'color'),
    background: chipColor('guesser', 'background'),
    // What it is: fewer than the first badge's 20 answered. "Just getting
    // started" read as a judgement to a five-month user (2026-10-09 dry run, D27).
    tagline: 'Fewer than 20 scored here',
  },
  // 'Tracker' until D80. The id stays 'tracker'.
  tracker: {
    label: 'Bronze',
    color: chipColor('tracker', 'color'),
    background: chipColor('tracker', 'background'),
    tagline: '20 or more scored answers',
  },
  // 'Forecaster' until D80.
  forecaster: {
    label: 'Silver',
    color: chipColor('forecaster', 'color'),
    background: chipColor('forecaster', 'background'),
    tagline: 'Above 70 at its low end, with 20 or more scored answers',
  },
  // 'Sharp' until D80.
  sharp: {
    label: 'Gold',
    color: chipColor('sharp', 'color'),
    background: chipColor('sharp', 'background'),
    tagline: 'Above 85 at its low end, with 50 or more scored answers',
  },
  // 'Oracle' until D80.
  oracle: {
    label: 'Platinum',
    color: chipColor('oracle', 'color'),
    background: chipColor('oracle', 'background'),
    tagline: 'Above 90 at its low end, with 100 or more scored answers',
  },
};

/**
 * The score a tier's low end must be above (CLAUDE.md badge table; the
 * engine's BADGE_REQUIREMENTS, which a test holds this to). Bronze counts
 * answers only.
 */
export const BADGE_SCORE_BAR: Partial<Record<BadgeLevel, number>> = {
  forecaster: 70,
  sharp: 85,
  oracle: 90,
};
