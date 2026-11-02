import type { BadgeLevel } from '@/types';

import { themed } from './theme';

/**
 * Display metadata for each per-category badge level. The criteria live in the
 * engine (`evaluateBadge`) — this is presentation only: the label and colors
 * used to render a badge chip. The emblem itself is `LensEmblem`; there are
 * no emoji (DESIGN_SYSTEM §5: they render differently per platform and read
 * as toys). `tagline` is a one-line description of
 * what the level means, shown in the badge legend.
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
 * A grey ladder (roadmap D33): each tier a step darker than the one below, up
 * to Sharp, and gold only for Oracle. Blue and violet went, so no tier
 * borrows a hue from the calibration colours or the AI defaults. Sharp stops
 * at a mid grey, not solid ink: the chip holds the emblem, whose Sharp face
 * is ink, and on an ink chip it vanished (10.6:1 on this grey).
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
    light: { color: '#15171B', background: '#C3C7CE' }, // 10.6:1
    dark: { color: '#F2F3F5', background: '#44474F' }, // 8.37:1
  },
  oracle: {
    light: { color: '#6B4510', background: '#F7ECD3' }, // 7.20:1
    dark: { color: '#E8B64C', background: '#2A1E08' }, // 8.72:1
  },
};

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
    // What it is: fewer than the Tracker's 20 resolved. "Just getting started"
    // read as a judgement to a five-month user (2026-10-09 dry run, D27).
    tagline: 'Fewer than 20 resolved here',
  },
  tracker: {
    label: 'Tracker',
    color: chipColor('tracker', 'color'),
    background: chipColor('tracker', 'background'),
    tagline: '20+ predictions resolved',
  },
  forecaster: {
    label: 'Forecaster',
    color: chipColor('forecaster', 'color'),
    background: chipColor('forecaster', 'background'),
    tagline: 'Above 70 at its low end, over 20+ predictions',
  },
  sharp: {
    label: 'Sharp',
    color: chipColor('sharp', 'color'),
    background: chipColor('sharp', 'background'),
    tagline: 'Above 85 at its low end, over 50+ predictions',
  },
  oracle: {
    label: 'Oracle',
    color: chipColor('oracle', 'color'),
    background: chipColor('oracle', 'background'),
    tagline: 'Above 90 at its low end, over 100+ predictions',
  },
};
