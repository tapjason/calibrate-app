// Presentation helper: turn the user's stats into a share-card payload and the
// line that goes on it. Pure and testable, same shape as stats/ratingHeadline.ts
// and warmup/verdictCopy.ts.
//
// The headline is the product's whole social pitch — "Sharp in health · Guesser
// in money" is a personality-test result with receipts. So the card leads with
// the CONTRAST between the user's best and worst category, not with an average.
// An average says nothing anyone wants to post.

import { APP_NAME } from '@/constants/app';
import { BADGE_META } from '@/constants/badges';
import {
  MIN_N_OVERALL,
  type BadgeLevel,
  type BucketStat,
  type Direction,
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

/** One square per confidence band, Wordle-style. */
const SQUARE: Record<Direction, string> = {
  calibrated: '🟩',
  overconfident: '🟧',
  underconfident: '🟦',
};
const EMPTY_SQUARE = '⬜';
const BAND_LOWS = [0, 20, 40, 60, 80] as const;

/**
 * The plain-text share (DESIGN_SYSTEM §7.5): spoiler-free, pasteable
 * anywhere, and never containing a prediction title. The squares and the
 * score appear only once the rating is unlocked — a row of verdicts built on
 * a handful of predictions is exactly the noise CLAUDE.md forbids publishing.
 *
 *   My calibration · Calibrate
 *   Sharp in health · Guesser in finance
 *   ⬜🟩🟩🟧🟧 score 81
 */
export function shareText(card: ShareCard, buckets: readonly BucketStat[]): string {
  const lines = [`My calibration · ${APP_NAME}`, shareHeadline(card)];
  if (card.rating !== null) {
    const byLow = new Map(buckets.map((b) => [b.low, b.direction]));
    const squares = BAND_LOWS.map((low) => {
      const d = byLow.get(low);
      return d ? SQUARE[d] : EMPTY_SQUARE;
    }).join('');
    lines.push(`${squares} score ${card.rating}`);
  } else {
    lines.push(`${card.total_resolved} predictions resolved so far`);
  }
  return lines.join('\n');
}
