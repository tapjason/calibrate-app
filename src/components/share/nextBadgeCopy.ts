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
import { categoryLabel } from '@/store/categoryStore';

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
 * Ties break by predictions made, most first, so the recap names where the
 * person actually logs (blind playtest 2026-11-12b finding 19: a farmer with
 * two Work calls and one Finance was told "Tracker in finance"), then by id so
 * the same data always tells the same story.
 */
export function nextBadgeProgress(
  stats: readonly CategoryStat[],
  nextBadges: NextBadges,
  /**
   * Each category score's give-or-take (roadmap D35): a tier above Tracker
   * needs the score minus it over the bar, so that is what "short" means.
   */
  giveOrTake: Partial<Record<Category, number>> = {},
): BadgeProgress | null {
  const low = (s: CategoryStat) => s.calibration_score - (giveOrTake[s.category] ?? 0);
  const ordered = [...stats].sort(
    (a, b) => b.predictions_made - a.predictions_made || a.category.localeCompare(b.category),
  );

  let bestCount: {
    stat: CategoryStat;
    next: NextBadgeTarget;
    remaining: number;
  } | null = null;
  for (const stat of ordered) {
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
    const scoreShort = next.needScore !== null && low(stat) <= next.needScore;
    return {
      category: stat.category,
      badge: next.badge,
      badgeLabel,
      text: scoreShort
        ? // "To reach": on a shared card "Sharp in work: …" read as a claim
          // to be Sharp in work (blind playtest 2026-11-05, run 5).
          `To reach ${badgeLabel} in ${categoryLabel(stat.category)}: ${remaining} more scored ${remaining === 1 ? 'answer' : 'answers'} and a score above ${next.needScore} at its low end`
        : // "of what" (blind playtest 2026-11-12e, run 3: with two guesses
          // logged, "20 to go" read as if they hadn't been counted), and "To
          // reach" as the score-short line has it: on a shared card a line
          // led by the tier reads as a claim to it (record audit 2026-11-12).
          // "or higher" for the first badge: at 20 a category whose score
          // already clears 70 at its low end goes straight to Forecaster, and
          // "Tracker, 1 more" then read as a broken promise (blind playtest
          // 2026-11-13, run 8; Insights says it since step 172).
          `To reach ${badgeLabel}${next.badge === 'tracker' ? ' or higher' : ''} in ${categoryLabel(stat.category)}: ${remaining} more scored ${remaining === 1 ? 'answer' : 'answers'}`,
      progress: stat.predictions_resolved / (next.needResolved as number),
    };
  }

  let bestScore: {
    stat: CategoryStat;
    next: NextBadgeTarget;
    gap: number;
  } | null = null;
  for (const stat of ordered) {
    const next = nextBadges[stat.category];
    if (!next || next.needScore === null || stat.score_is_provisional) continue;
    const gap = next.needScore - low(stat);
    if (gap < 0) continue;
    if (!bestScore || gap < bestScore.gap) bestScore = { stat, next, gap };
  }

  if (bestScore) {
    const { stat, next } = bestScore;
    const badgeLabel = BADGE_META[next.badge].label;
    const spread = giveOrTake[stat.category] ?? 0;
    // One rule, said one way (blind playtest 2026-11-04): the score with its
    // give-or-take, since the low end is what has to clear the bar.
    return {
      category: stat.category,
      badge: next.badge,
      badgeLabel,
      text: `To reach ${badgeLabel} in ${categoryLabel(stat.category)}: a score above ${next.needScore} at its low end (now ${Math.floor(
        stat.calibration_score,
      )}${spread > 0 ? `, give or take ${spread}` : ''})`,
      progress: null,
    };
  }

  return null;
}
