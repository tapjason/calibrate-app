// Presentation helper: turn the user's stats into a share-card payload and the
// line that goes on it. Pure and testable, same shape as stats/ratingHeadline.ts
// and warmup/verdictCopy.ts.
//
// The headline is the product's whole social pitch — "Sharp in health · Guesser
// in money" is a personality-test result with receipts. So the card leads with
// the CONTRAST between the user's best and worst category, not with an average.
// An average says nothing anyone wants to post.

import { BADGE_META } from '@/constants/badges';
import {
  MIN_N_OVERALL,
  type BadgeLevel,
  type CategoryStat,
  type ShareCard,
  type UserStat,
} from '@/types';

/** Ladder order, weakest to strongest. Index doubles as the rank. */
const BADGE_ORDER: readonly BadgeLevel[] = [
  'guesser',
  'tracker',
  'forecaster',
  'sharp',
  'oracle',
];

const rankOf = (badge: BadgeLevel): number => BADGE_ORDER.indexOf(badge);

/**
 * Build the card payload. Returns null when there is nothing worth showing —
 * no stats at all, or no category with a single resolution behind it.
 *
 * Categories are ordered strongest badge first, ties broken by the number of
 * resolutions so the better-evidenced category leads.
 */
export function buildShareCard(
  userStat: UserStat | null,
  categoryStats: CategoryStat[],
): ShareCard | null {
  if (!userStat) return null;

  const withData = categoryStats.filter((c) => c.predictions_resolved > 0);
  if (withData.length === 0) return null;

  const ordered = [...withData].sort((a, b) => {
    const byBadge = rankOf(b.badge_level) - rankOf(a.badge_level);
    if (byBadge !== 0) return byBadge;
    return b.predictions_resolved - a.predictions_resolved;
  });

  return {
    categories: ordered.map((c) => ({
      category: c.category,
      badge_level: c.badge_level,
    })),
    // Provisional ratings never reach a card. The engine already computes the
    // number for internal use; this is the boundary where we decline to
    // publish it.
    rating: userStat.rating_is_provisional
      ? null
      : Math.round(userStat.calibration_rating),
    total_resolved: userStat.total_resolved,
  };
}

/**
 * The headline line: best and worst category, joined by a middle dot. With
 * only one category on file there is no contrast to draw, so it stands alone.
 */
export function shareHeadline(card: ShareCard): string {
  const [best] = card.categories;
  if (!best) return '';

  const label = (c: ShareCard['categories'][number]) =>
    `${BADGE_META[c.badge_level].label} in ${c.category}`;

  if (card.categories.length === 1) return label(best);

  const worst = card.categories[card.categories.length - 1];
  return `${label(best)} · ${label(worst)}`;
}

/**
 * The sub-line under the headline: the rating, or — while provisional — how
 * many resolutions are still needed before there is a rating worth printing.
 */
export function shareSubline(card: ShareCard): string {
  if (card.rating === null) {
    const remaining = Math.max(0, MIN_N_OVERALL - card.total_resolved);
    return `${remaining} more resolutions until my calibration unlocks`;
  }
  return `Calibration ${card.rating}/100 · ${card.total_resolved} predictions resolved`;
}
