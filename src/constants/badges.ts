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
 */
export const BADGE_CHIP_COLORS: Record<
  BadgeLevel,
  Record<'light' | 'dark', { color: string; background: string }>
> = {
  guesser: {
    // #6b7280 was 4.39:1 on this fill, under the 4.5 floor; textSecondary's ink.
    light: { color: '#4E4C66', background: '#f3f4f6' },
    dark: { color: '#B9B7CE', background: '#211F36' },
  },
  tracker: {
    light: { color: '#475569', background: '#f1f5f9' },
    dark: { color: '#CBD5E1', background: '#1E293B' },
  },
  forecaster: {
    light: { color: '#2563eb', background: '#eff6ff' },
    dark: { color: '#93C5FD', background: '#172554' },
  },
  sharp: {
    light: { color: '#7c3aed', background: '#f5f3ff' },
    dark: { color: '#C4B5FD', background: '#2E1065' },
  },
  oracle: {
    light: { color: '#b45309', background: '#fffbeb' },
    dark: { color: '#FCD34D', background: '#422006' },
  },
};

function chipColor(tier: BadgeLevel, part: 'color' | 'background'): string {
  const { light, dark } = BADGE_CHIP_COLORS[tier];
  return themed(`badge-${tier}-${part}`, light[part], dark[part]);
}

export const BADGE_META: Record<BadgeLevel, BadgeMeta> = {
  guesser: {
    label: 'Guesser',
    color: chipColor('guesser', 'color'),
    background: chipColor('guesser', 'background'),
    tagline: 'Just getting started',
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
    tagline: 'Above 70 over 20+ predictions',
  },
  sharp: {
    label: 'Sharp',
    color: chipColor('sharp', 'color'),
    background: chipColor('sharp', 'background'),
    tagline: 'Above 85 over 50+ predictions',
  },
  oracle: {
    label: 'Oracle',
    color: chipColor('oracle', 'color'),
    background: chipColor('oracle', 'background'),
    tagline: 'Above 90 over 100+ predictions',
  },
};
