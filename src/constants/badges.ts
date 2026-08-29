import type { BadgeLevel } from '@/types';

/**
 * Display metadata for each per-category badge level. The criteria live in the
 * engine (`evaluateBadge`) — this is presentation only: the emoji, label, and
 * colors used to render a badge chip. `tagline` is a one-line description of
 * what the level means, shown in the badge legend.
 */
export interface BadgeMeta {
  label: string;
  emoji: string;
  /** Foreground / accent color for the chip text + emoji ring. */
  color: string;
  /** Chip background. */
  background: string;
  tagline: string;
}

export const BADGE_META: Record<BadgeLevel, BadgeMeta> = {
  guesser: {
    label: 'Guesser',
    emoji: '🎲',
    color: '#6b7280',
    background: '#f3f4f6',
    tagline: 'Just getting started',
  },
  tracker: {
    label: 'Tracker',
    emoji: '📊',
    color: '#475569',
    background: '#f1f5f9',
    tagline: '20+ predictions resolved',
  },
  forecaster: {
    label: 'Forecaster',
    emoji: '🔭',
    color: '#2563eb',
    background: '#eff6ff',
    tagline: 'Above 70 over 20+ predictions',
  },
  sharp: {
    label: 'Sharp',
    emoji: '🎯',
    color: '#7c3aed',
    background: '#f5f3ff',
    tagline: 'Above 85 over 50+ predictions',
  },
  oracle: {
    label: 'Oracle',
    emoji: '🔮',
    color: '#b45309',
    background: '#fffbeb',
    tagline: 'Above 90 over 100+ predictions',
  },
};
