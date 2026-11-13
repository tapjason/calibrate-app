// Presentation helper: turn the user's stats into a share-card payload and the
// line that goes on it. Pure and testable, same shape as stats/ratingHeadline.ts
// and warmup/verdictCopy.ts.
//
// The headline is the product's whole social pitch — "Sharp in health · Guesser
// in money" is a personality-test result with receipts. So the card leads with
// the CONTRAST between the user's best and worst category, not with an average.
// An average says nothing anyone wants to post.

import { localCount } from '@/components/ui/count';
import { APP_NAME } from '@/constants/app';
import { BADGE_META } from '@/constants/badges';
import {
  MIN_N_BAND,
  MIN_N_OVERALL,
  type BadgeLevel,
  type BucketStat,
  type Category,
  type Direction,
  type CategoryStat,
  type ShareCard,
  type UserStat,
} from '@/types';
import { categoryLabel } from '@/store/categoryStore';

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
 * Categories are ordered strongest badge first. Within a tier, two unlocked
 * scores order by score, so the contrast line names the tier's weakest
 * calibration (a Guesser at 62 before a Guesser at 94, which is only a Guesser
 * for lack of resolutions); otherwise the better-evidenced category leads.
 */
export function buildShareCard(
  userStat: UserStat | null,
  categoryStats: CategoryStat[],
  /**
   * The rating's give-or-take and how many categories on file the person left
   * off (decided 2026-11-03). Both go on the card; neither changes its lines.
   */
  extras: { giveOrTake?: number | null; hiddenCount?: number } = {},
): ShareCard | null {
  if (!userStat) return null;

  const withData = categoryStats.filter((c) => c.predictions_resolved > 0);
  if (withData.length === 0) return null;

  const ordered = [...withData].sort((a, b) => {
    const byBadge = rankOf(b.badge_level) - rankOf(a.badge_level);
    if (byBadge !== 0) return byBadge;
    if (!a.score_is_provisional && !b.score_is_provisional) {
      const byScore = b.calibration_score - a.calibration_score;
      if (byScore !== 0) return byScore;
    }
    return b.predictions_resolved - a.predictions_resolved;
  });

  const giveOrTake = Math.round(extras.giveOrTake ?? 0);
  const hiddenCount = extras.hiddenCount ?? 0;
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
    ...(giveOrTake > 0 && !userStat.rating_is_provisional ? { give_or_take: giveOrTake } : {}),
    ...(hiddenCount > 0 ? { hidden_count: hiddenCount } : {}),
  };
}

/** The identity line before any category is past the count gate (D27). */
export const UNGATED_IDENTITY = 'Calibrating';

/**
 * The headline as the card lays it out (DESIGN_SYSTEM §7.5): the identity
 * line large, the contrast line smaller beneath it.
 *
 * Only categories past the count gate are named (roadmap D27, 2026-10-10):
 * Guesser means "fewer than 20 scored here", and "Guesser in finance" after
 * five months read as a verdict. So the identity is the best gated category,
 * the contrast the weakest gated one when its tier differs, and with none
 * gated yet the identity is "Calibrating" and there's no contrast. Categories
 * arrive strongest first (buildShareCard).
 */
export function shareLines(card: ShareCard): { identity: string; contrast: string | null } {
  if (card.categories.length === 0) return { identity: '', contrast: null };
  const gated = card.categories.filter((c) => c.badge_level !== 'guesser');
  const [best] = gated;
  // With no badge yet but the rating unlocked, the rating leads: "Calibrating"
  // above "Calibration 89/100" read as a contradiction (blind playtest
  // 2026-11-09b, finding 10; roadmap D54).
  if (!best) {
    return {
      identity: card.rating !== null ? `Calibration ${card.rating}/100` : UNGATED_IDENTITY,
      contrast: null,
    };
  }
  const label = (c: ShareCard['categories'][number]) =>
    `${BADGE_META[c.badge_level].label} in ${categoryLabel(c.category)}`;
  // Every category at the top tier, not one picked by an unstated rule
  // (finding 10): "Forecaster in health and money".
  const top = gated.filter((c) => c.badge_level === best.badge_level).map((c) => categoryLabel(c.category));
  const identity = `${BADGE_META[best.badge_level].label} in ${joinNames(top)}`;
  const worst = gated[gated.length - 1];
  const contrast =
    gated.length > 1 && worst.badge_level !== best.badge_level ? label(worst) : null;
  return { identity, contrast };
}

/**
 * "health", "health and money", "health and 2 more". Two names only when both
 * are short: a person's own names run to 24 characters, and a long line made
 * the card shrink to fit until its chips were unreadable (review, 2026-11-09).
 */
const SHORT_NAME = 12;
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2 && names.every((n) => n.length <= SHORT_NAME)) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} more`;
}

/** The headline on one line, for the text share: "Sharp in health · Tracker in finance". */
export function shareHeadline(card: ShareCard): string {
  const { identity, contrast } = shareLines(card);
  return contrast ? `${identity} · ${contrast}` : identity;
}

/**
 * The sub-line under the headline: the rating, or — while provisional — how
 * many resolutions are still needed before there is a rating worth printing.
 */
export function shareSubline(card: ShareCard): string {
  if (card.rating === null) {
    const remaining = Math.max(0, MIN_N_OVERALL - card.total_resolved);
    return `${remaining} more scored ${remaining === 1 ? 'answer' : 'answers'} until my calibration unlocks`;
  }
  // The give-or-take in Insights' words (D35): a card is the most public
  // number the app makes, so it carries the same honesty (decided 2026-11-03).
  const range = card.give_or_take ? `, give or take ${card.give_or_take},` : '';
  // The rating already leads as the identity (no badge yet): not twice.
  if (!card.categories.some((c) => c.badge_level !== 'guesser')) {
    return card.give_or_take
      ? `Give or take ${card.give_or_take}, from ${localCount(card.total_resolved)} scored answers`
      : `From ${localCount(card.total_resolved)} scored answers`;
  }
  return `Calibration ${card.rating}/100${range} from ${localCount(card.total_resolved)} scored answers`;
}

/**
 * The categories the person left off their cards (roadmap D42), among those
 * on file. Never all of them: the last one stays, so a stored choice that
 * would hide every category on file now (after an erase, say) hides none.
 * The share card and both recaps read it, so a category hidden on one
 * doesn't come back on another (blind playtest 2026-11-04, run 3).
 */
export function cardHiddenCategories(
  categoryStats: readonly CategoryStat[],
  stored: readonly Category[],
): ReadonlySet<Category> {
  const onFile = categoryStats.filter((c) => c.predictions_resolved > 0);
  const hidden = onFile.map((c) => c.category).filter((c) => stored.includes(c));
  return new Set(hidden.length < onFile.length ? hidden : []);
}

/** "2 categories not shown", or null for none. */
export function hiddenCountLine(n: number): string | null {
  if (n <= 0) return null;
  return `${n} ${n === 1 ? 'category' : 'categories'} not shown`;
}

/**
 * "2 categories not shown", when the person left some off the card, or null.
 * Hiding one can change the headline, and a blind tester's curated card read
 * as the whole record (playtest 2026-11-03, run 4).
 */
export function hiddenLine(card: ShareCard): string | null {
  return hiddenCountLine(card.hidden_count ?? 0);
}

/**
 * Whether the card draws its strip, the text share its squares and the card's
 * label their words: once the rating is unlocked and some range has 10
 * answers (roadmap D58). With every range thinner, they'd be all grey (owner,
 * 2026-11-10), so they wait, as they do while the rating is provisional.
 */
export function showsRanges(card: ShareCard, buckets: readonly BucketStat[]): boolean {
  return card.rating !== null && buckets.some((b) => b.total_resolved >= MIN_N_BAND);
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
 * What the squares mean, under them (step 173): to a red-green colour-blind
 * reader 🟩 and 🟧 look alike, and nobody had a key (blind playtest
 * 2026-11-12f, finding 3; 2026-11-05 run 6). In the strip's own words
 * (STRIP_WORDS): a green square is inside luck, not "about right" (D57). The
 * squares have no 0% and 100% ends, so the order is said.
 */
/**
 * The card strip's key, one line under it (step 173; D58 had left the strip
 * without one, reversed by the owner on 2026-11-12). ▲ came true more often
 * than said, so too cautious; ▼ too sure.
 */
export const STRIP_KEY = '○ no clear lean · ▲ too cautious · ▼ too sure · • under 10 answers · – none';

export const SQUARES_KEY =
  'Low to high: 🟩 no clear lean · 🟧 too sure · 🟦 too cautious · ⬜ under 10 answers';

/**
 * The plain-text share (DESIGN_SYSTEM §7.5): spoiler-free, pasteable
 * anywhere, and never containing a prediction title. The squares and the
 * score appear only once the rating is unlocked — a row of verdicts built on
 * a handful of predictions is exactly the noise CLAUDE.md forbids publishing.
 *
 *   My calibration · Fairly Sure
 *   Sharp in health · Guesser in finance
 *   ⬜🟩🟩🟧🟧 score 81
 *   https://apps.apple.com/app/apple-store/id…?pt=…&ct=share-card-text&mt=8
 *
 * The last line is the App Store link, once the app has one (`@/share/link`,
 * GROWTH §0 step 1): the name alone doesn't find the app in the store.
 */
export function shareText(
  card: ShareCard,
  buckets: readonly BucketStat[],
  link: string | null = null,
): string {
  const lines = [`My calibration · ${APP_NAME}`, shareHeadline(card)];
  if (card.rating !== null) {
    const byLow = new Map(buckets.map((b) => [b.low, b]));
    // A range under 10 answers has no lean to show (roadmap D58), so it's
    // the white square, as an empty one is: nothing to read there yet.
    // None at all until some range has 10 (showsRanges).
    const squares = showsRanges(card, buckets)
      ? BAND_LOWS.map((low) => {
          const b = byLow.get(low);
          return b && b.total_resolved >= MIN_N_BAND ? SQUARE[b.direction] : EMPTY_SQUARE;
        }).join('')
      : null;
    const g = card.give_or_take;
    // Not twice when the rating already leads (no badge yet, D54).
    const leads = !card.categories.some((c) => c.badge_level !== 'guesser');
    const line = leads
      ? squares
        ? `${squares}${g ? ` give or take ${g}` : ''}`
        : g
          ? `Give or take ${g}`
          : null
      : `${squares ? `${squares} score` : 'Score'} ${card.rating}${g ? `, give or take ${g}` : ''}`;
    if (line) lines.push(line);
    if (squares) lines.push(SQUARES_KEY);
  } else {
    lines.push(`${card.total_resolved} answers scored so far`);
  }
  const hidden = hiddenLine(card);
  if (hidden) lines.push(hidden);
  if (link) lines.push(link);
  return lines.join('\n');
}

/**
 * What a screen reader hears for the identity card (roadmap step 45). The
 * card is a picture made to be shared, so it's one element, and its chips
 * carry each category's tier by emblem alone: the summary says them in words.
 */
export function identityCardSummary(
  card: ShareCard,
  /** The dot strip's ranges, when the card draws it (a rating to show). */
  buckets: readonly BucketStat[] = [],
): string {
  const { identity, contrast } = shareLines(card);
  const lead = contrast ? `${identity}, ${contrast}` : identity;
  const each = card.categories
    .map((c) => `${BADGE_META[c.badge_level].label} in ${categoryLabel(c.category)}`)
    .join(', ');
  const hidden = hiddenLine(card);
  const strip = showsRanges(card, buckets) ? ` ${stripSummary(buckets)}` : '';
  return `Share card. ${lead}. ${shareSubline(card)}.${strip} By category: ${each}.${hidden ? ` ${hidden}.` : ''}`;
}

const STRIP_WORDS: Record<Direction, string> = {
  overconfident: 'too sure',
  underconfident: 'too cautious',
  calibrated: 'no clear lean',
};

/**
 * The card's dot strip in words (roadmap D47): what each range did, low to
 * high, in the chart title's words (D37). The strip itself shows it by shape
 * as well as colour; this is for VoiceOver, which sees the card as one image.
 * A range under MIN_N_BAND gets no lean word (R4: none below 10), as it gets
 * no lean mark (D58).
 */
export function stripSummary(buckets: readonly BucketStat[]): string {
  const parts = [...buckets]
    .sort((a, b) => a.low - b.low)
    .map(
      (b) =>
        `${b.low} to ${b.high}%, ${b.total_resolved < MIN_N_BAND ? 'too few to read yet' : STRIP_WORDS[b.direction]}`,
    );
  return `By range, low to high: ${parts.join('; ')}.`;
}
