// Presentation helper for the "next badge" line on Calibration Wrapped. Pure
// and testable, like wrappedCopy.ts.
//
// The badge criteria and each category's next target are computed upstream
// (evaluateBadge / nextBadge in the engine, via statsStore.nextBadges). This
// file only picks which one to talk about and words it.
//
// Why this line exists: a week is too small for a calibration verdict, so the
// weekly card needs something that moves every week. Badge progress is the
// identity layer CLAUDE.md says carries retention, and "3 to go" is a count,
// not an inference, so it is honest at any sample size (DESIGN_SYSTEM §7.14).

import { BADGE_META } from '@/constants/badges';
import type { BadgeLevel, Category, CategoryStat, NextBadgeTarget } from '@/types';

export interface BadgeProgress {
  category: Category;
  /** The tier being worked toward, drawn as a blueprint emblem. */
  badge: BadgeLevel;
  /** Display label of the badge being worked toward, e.g. "Tracker". */
  badgeLabel: string;
  /** "Tracker in health: 3 to go". */
  text: string;
  /**
   * Share of the resolution requirement met, 0–1. Null when the next badge is
   * gated on score rather than on resolutions — a score isn't a distance you
   * cover, so it gets no progress stroke.
   */
  progress: number | null;
}

type NextBadges = Partial<Record<Category, NextBadgeTarget | null>>;

/**
 * The badge closest to hand across all categories, or null when there's
 * nothing honest to say.
 *
 * Resolution gates come first: "3 to go" is the most concrete thing the card
 * can offer, and resolving is fully in the user's hands. Only when no
 * category is short on resolutions does a score gate get mentioned, and then
 * only for a category whose score is no longer provisional — a score built on
 * noise is never printed (CLAUDE.md min-N rule).
 *
 * Ties break alphabetically by category so the same data always tells the
 * same story.
 */
export function nextBadgeProgress(
  stats: readonly CategoryStat[],
  nextBadges: NextBadges,
): BadgeProgress | null {
  const byName = [...stats].sort((a, b) => a.category.localeCompare(b.category));

  let bestCount: {
    stat: CategoryStat;
    next: NextBadgeTarget;
    remaining: number;
  } | null = null;
  for (const stat of byName) {
    const next = nextBadges[stat.category];
    if (!next || next.needResolved === null) continue;
    const remaining = next.needResolved - stat.predictions_resolved;
    if (remaining <= 0) continue;
    if (!bestCount || remaining < bestCount.remaining) {
      bestCount = { stat, next, remaining };
    }
  }

  if (bestCount) {
    const { stat, next, remaining } = bestCount;
    const badgeLabel = BADGE_META[next.badge].label;
    // When the score is short as well, "20 to go" alone would promise a badge
    // that resolving can't earn (roadmap step 47). Only the threshold is
    // printed, never the score itself.
    const scoreShort = next.needScore !== null && stat.calibration_score <= next.needScore;
    return {
      category: stat.category,
      badge: next.badge,
      badgeLabel,
      text: scoreShort
        ? `${badgeLabel} in ${stat.category}: ${remaining} more resolved and a score above ${next.needScore}`
        : `${badgeLabel} in ${stat.category}: ${remaining} to go`,
      progress: stat.predictions_resolved / (next.needResolved as number),
    };
  }

  let bestScore: {
    stat: CategoryStat;
    next: NextBadgeTarget;
    gap: number;
  } | null = null;
  for (const stat of byName) {
    const next = nextBadges[stat.category];
    if (!next || next.needScore === null || stat.score_is_provisional) continue;
    const gap = next.needScore - stat.calibration_score;
    if (gap < 0) continue;
    if (!bestScore || gap < bestScore.gap) bestScore = { stat, next, gap };
  }

  if (bestScore) {
    const { stat, next } = bestScore;
    const badgeLabel = BADGE_META[next.badge].label;
    return {
      category: stat.category,
      badge: next.badge,
      badgeLabel,
      text: `${badgeLabel} in ${stat.category}: a score above ${next.needScore} (now ${Math.floor(
        stat.calibration_score,
      )})`,
      progress: null,
    };
  }

  return null;
}
