import { useCategoryStore } from '@/store/categoryStore';
import type { BucketStat, CategoryStat, ShareCard, UserStat } from '@/types';

import {
  buildShareCard,
  hiddenLine,
  identityCardSummary,
  shareHeadline,
  shareLines,
  shareSubline,
  shareText,
  stripSummary,
} from './cardCopy';

function userStat(over: Partial<UserStat> = {}): UserStat {
  return {
    user_id: 'u1',
    calibration_rating: 88.4,
    total_predictions: 60,
    total_resolved: 55,
    current_streak: 3,
    rating_is_provisional: false,
    ...over,
  };
}

function categoryStat(over: Partial<CategoryStat> = {}): CategoryStat {
  return {
    user_id: 'u1',
    category: 'health',
    predictions_made: 20,
    predictions_resolved: 20,
    calibration_score: 88,
    score_is_provisional: false,
    badge_level: 'sharp',
    ...over,
  };
}

describe('buildShareCard', () => {
  it('returns null with no stats to show', () => {
    expect(buildShareCard(null, [])).toBeNull();
    expect(buildShareCard(userStat(), [])).toBeNull();
  });

  it('ignores categories with nothing resolved yet', () => {
    const card = buildShareCard(userStat(), [
      categoryStat({ category: 'finance', predictions_resolved: 0 }),
    ]);
    expect(card).toBeNull();
  });

  it('orders categories strongest badge first', () => {
    const card = buildShareCard(userStat(), [
      categoryStat({ category: 'finance', badge_level: 'guesser' }),
      categoryStat({ category: 'health', badge_level: 'sharp' }),
      categoryStat({ category: 'work', badge_level: 'tracker' }),
    ]);
    expect(card?.categories.map((c) => c.category)).toEqual([
      'health',
      'work',
      'finance',
    ]);
  });

  it('breaks badge ties on the better-evidenced category', () => {
    const card = buildShareCard(userStat(), [
      categoryStat({
        category: 'work',
        badge_level: 'tracker',
        predictions_resolved: 20,
      }),
      categoryStat({
        category: 'social',
        badge_level: 'tracker',
        predictions_resolved: 45,
      }),
    ]);
    expect(card?.categories[0].category).toBe('social');
  });

  it('names the weakest unlocked score as the contrast within a tier', () => {
    const card = buildShareCard(userStat(), [
      categoryStat({ category: 'health', badge_level: 'sharp', predictions_resolved: 55 }),
      categoryStat({
        category: 'finance',
        badge_level: 'tracker',
        predictions_resolved: 24,
        calibration_score: 62,
      }),
      categoryStat({
        category: 'social',
        badge_level: 'tracker',
        predictions_resolved: 25,
        calibration_score: 68,
      }),
    ]);
    expect(shareLines(card!).contrast).toBe('Tracker in finance');
  });

  // CLAUDE.md: never present a number built on noise — least of all on the
  // most public artifact the app produces.
  it('withholds a provisional rating from the card', () => {
    const card = buildShareCard(
      userStat({ rating_is_provisional: true, total_resolved: 8 }),
      [categoryStat()],
    );
    expect(card?.rating).toBeNull();
  });

  it('rounds a settled rating for display', () => {
    const card = buildShareCard(userStat(), [categoryStat()]);
    expect(card?.rating).toBe(88);
  });
});

describe('shareHeadline', () => {
  it('contrasts the best and the weakest category past the count gate', () => {
    const card = buildShareCard(userStat(), [
      categoryStat({ category: 'health', badge_level: 'sharp' }),
      categoryStat({ category: 'work', badge_level: 'tracker' }),
      categoryStat({ category: 'finance', badge_level: 'guesser' }),
    ])!;
    // Roadmap D27: finance, a Guesser (fewer than 20 answered), isn't named.
    expect(shareHeadline(card)).toBe('Sharp in health · Tracker in work');
  });

  it('stands alone when there is only one category to show', () => {
    const card = buildShareCard(userStat(), [
      categoryStat({ category: 'health', badge_level: 'forecaster' }),
    ])!;
    expect(shareHeadline(card)).toBe('Forecaster in health');
  });
});

describe('shareSubline', () => {
  it('prints the rating once it has settled', () => {
    const card = buildShareCard(userStat(), [categoryStat()])!;
    expect(shareSubline(card)).toBe(
      'Calibration 88/100 from 55 scored answers',
    );
  });

  it('counts down to the threshold while provisional', () => {
    const card = buildShareCard(
      userStat({ rating_is_provisional: true, total_resolved: 8 }),
      [categoryStat()],
    )!;
    expect(shareSubline(card)).toBe(
      '12 more scored answers until my calibration unlocks',
    );
  });
});

describe('shareText', () => {
  const bucket = (low: number, direction: BucketStat['direction']): BucketStat => ({
    low,
    high: low + 20,
    total_resolved: 10,
    resolved_yes: 5,
    stated_confidence_mean: low + 10,
    actual_rate: 0.5,
    bucket_error: 0,
    direction,
    chance_low: 0,
    chance_high: 1,
    expected_yes: 0,
  });
  const card = (rating: number | null): ShareCard => ({
    categories: [
      { category: 'health', badge_level: 'sharp' },
      { category: 'finance', badge_level: 'tracker' },
    ],
    rating,
    total_resolved: 40,
  });

  it('is Wordle-style once the rating is unlocked: one square per band', () => {
    const text = shareText(card(81), [
      bucket(20, 'calibrated'),
      bucket(40, 'calibrated'),
      bucket(60, 'overconfident'),
      bucket(80, 'underconfident'),
    ]);
    expect(text).toBe(
      'My calibration · Fairly Sure\nSharp in health · Tracker in finance\n⬜🟩🟩🟧🟦 score 81',
    );
  });

  // Roadmap D58: a range under 10 answers shows no lean, here as on the card.
  it('gives a range under 10 answers the white square', () => {
    const thin = { ...bucket(80, 'overconfident'), total_resolved: 9 };
    const text = shareText(card(81), [bucket(60, 'calibrated'), thin]);
    expect(text.split('\n')[2]).toBe('⬜⬜⬜🟩⬜ score 81');
  });

  // Roadmap D58 (owner, 2026-11-10): all white squares say nothing, so
  // none until some range has 10; the score stays.
  it('drops the squares, keeping the score, while every range is under 10', () => {
    const thin = (low: number) => ({ ...bucket(low, 'overconfident'), total_resolved: 8 });
    const text = shareText({ ...card(81), give_or_take: 3 }, [thin(60), thin(80)]);
    expect(text.split('\n')[2]).toBe('Score 81, give or take 3');
    expect(text).not.toMatch(/⬜/);
  });

  // CLAUDE.md: never publish a verdict built on noise.
  it('drops the squares and score while provisional', () => {
    const text = shareText(card(null), [bucket(80, 'overconfident')]);
    expect(text).not.toMatch(/score \d|🟧/);
    expect(text).toContain('40 answers scored so far');
  });

  it('never carries a prediction title', () => {
    const text = shareText(card(81), []);
    expect(text.split('\n')).toHaveLength(3);
  });

  // GROWTH §0 step 1: the name alone doesn't find the app in the store.
  it('ends on the App Store link when there is one', () => {
    const link = 'https://apps.apple.com/app/apple-store/id1?pt=2&ct=share-card-text&mt=8';
    const text = shareText(card(81), [], link);
    expect(text.split('\n')).toHaveLength(4);
    expect(text.endsWith(`\n${link}`)).toBe(true);
    expect(shareText(card(81), [], null).split('\n')).toHaveLength(3);
  });
});

describe('shareLines', () => {
  const card = (levels: Array<[string, string]>): ShareCard => ({
    categories: levels.map(([category, badge_level]) => ({
      category: category as ShareCard['categories'][number]['category'],
      badge_level: badge_level as ShareCard['categories'][number]['badge_level'],
    })),
    rating: null,
    total_resolved: 30,
  });

  it('splits best and worst into an identity line and a contrast line', () => {
    expect(shareLines(card([['health', 'sharp'], ['finance', 'tracker']]))).toEqual({
      identity: 'Sharp in health',
      contrast: 'Tracker in finance',
    });
  });

  // Roadmap D27: Guesser means fewer than 20 answered, so it's never named.
  it('never names a Guesser as the contrast', () => {
    expect(shareLines(card([['health', 'sharp'], ['finance', 'guesser']]))).toEqual({
      identity: 'Sharp in health',
      contrast: null,
    });
  });

  it('reads "Calibrating" until a category is past the count gate', () => {
    expect(shareLines(card([['work', 'guesser'], ['health', 'guesser']]))).toEqual({
      identity: 'Calibrating',
      contrast: null,
    });
  });

  it('draws no contrast when the tiers are the same', () => {
    expect(shareLines(card([['work', 'tracker'], ['health', 'tracker']])).contrast).toBeNull();
  });

  it('draws no contrast with a single category', () => {
    expect(shareLines(card([['work', 'tracker']]))).toEqual({
      identity: 'Tracker in work',
      contrast: null,
    });
  });
});

describe('shareSubline plural', () => {
  it('says "1 more scored answer", not "answers"', () => {
    expect(
      shareSubline({ categories: [], rating: null, total_resolved: 19 }),
    ).toBe('1 more scored answer until my calibration unlocks');
  });
});

// Roadmap step 45: the card is a picture; its summary says it in words,
// including each category's tier, which the chips show by emblem alone.
describe('identityCardSummary', () => {
  it('reads the headline, the score and every category with its tier', () => {
    const card = buildShareCard(userStat(), [
      categoryStat({ category: 'health', badge_level: 'sharp' }),
      categoryStat({ category: 'finance', badge_level: 'guesser', calibration_score: 62 }),
    ])!;
    // The lines name gated tiers only (D27); the chips, read in full, show all.
    expect(identityCardSummary(card)).toBe(
      'Share card. Sharp in health. ' +
        'Calibration 88/100 from 55 scored answers. ' +
        'By category: Sharp in health, Getting started in finance.',
    );
  });
});

// Decided 2026-11-03 (playtest run 4): the card carries the rating's
// give-or-take, and says when categories were left off it.
describe('the honest card', () => {
  it('prints the give-or-take beside the rating', () => {
    const card = buildShareCard(userStat(), [categoryStat()], { giveOrTake: 3.4 })!;
    expect(shareSubline(card)).toBe(
      'Calibration 88/100, give or take 3, from 55 scored answers',
    );
    // No ranges to show (D58), so no squares before it.
    expect(shareText(card, [])).toContain('Score 88, give or take 3');
  });

  it('prints no give-or-take while the rating is provisional, or when it is 0', () => {
    const provisional = buildShareCard(
      userStat({ rating_is_provisional: true, total_resolved: 8 }),
      [categoryStat()],
      { giveOrTake: 9 },
    )!;
    expect(provisional.give_or_take).toBeUndefined();
    const exact = buildShareCard(userStat(), [categoryStat()], { giveOrTake: 0 })!;
    expect(shareSubline(exact)).toBe('Calibration 88/100 from 55 scored answers');
  });

  it('says how many categories were left off', () => {
    const one = buildShareCard(userStat(), [categoryStat()], { hiddenCount: 1 })!;
    expect(hiddenLine(one)).toBe('1 category not shown');
    const two = buildShareCard(userStat(), [categoryStat()], { hiddenCount: 2 })!;
    expect(hiddenLine(two)).toBe('2 categories not shown');
    expect(shareText(two, []).split('\n')).toContain('2 categories not shown');
    expect(identityCardSummary(two)).toMatch(/2 categories not shown\.$/);
    expect(hiddenLine(buildShareCard(userStat(), [categoryStat()])!)).toBeNull();
  });
});

// Roadmap D54 (blind playtest 2026-11-09b, finding 10).
describe('shareLines and shareSubline, the headline that agrees with itself', () => {
  const card = (levels: Array<[string, string]>, rating: number | null): ShareCard => ({
    categories: levels.map(([category, badge_level]) => ({
      category: category as ShareCard['categories'][number]['category'],
      badge_level: badge_level as ShareCard['categories'][number]['badge_level'],
    })),
    rating,
    total_resolved: 148,
    give_or_take: rating === null ? undefined : 3,
  });

  it('names every category at the top tier', () => {
    expect(shareLines(card([['health', 'forecaster'], ['finance', 'forecaster'], ['work', 'tracker']], 80))).toEqual({
      identity: 'Forecaster in health and finance',
      contrast: 'Tracker in work',
    });
    expect(
      shareLines(card([['health', 'tracker'], ['finance', 'tracker'], ['work', 'tracker'], ['social', 'tracker']], 80))
        .identity,
    ).toBe('Tracker in health and 3 more');
  });

  it("pairs two names only when both are short, so a person's own long name doesn't shrink the card", () => {
    useCategoryStore.setState({
      defs: [
        { id: 'finance', user_id: 'u1', name: 'Grandchildren visits', icon: null, hidden: false, position: 0, created_at: '2026-01-01T00:00:00.000Z' },
      ],
    });
    expect(shareLines(card([['health', 'forecaster'], ['finance', 'forecaster']], 80)).identity).toBe(
      'Forecaster in health and 1 more',
    );
    useCategoryStore.setState({ defs: [] });
  });

  it('leads with the rating, once, when it is unlocked and no category has a badge', () => {
    const c = card([['health', 'guesser']], 89);
    expect(shareLines(c)).toEqual({ identity: 'Calibration 89/100', contrast: null });
    expect(shareSubline(c)).toBe('Give or take 3, from 148 scored answers');
    // The text share doesn't say the score a second time.
    expect(shareText(c, []).match(/89/g)).toHaveLength(1);
    expect(shareLines(card([['health', 'guesser']], null)).identity).toBe('Calibrating');
  });
});

const strip = (low: number, direction: BucketStat['direction'], n = 12): BucketStat => ({
  low,
  high: low + 20,
  total_resolved: n,
  resolved_yes: Math.round(n / 2),
  stated_confidence_mean: low + 10,
  actual_rate: 0.5,
  bucket_error: 0,
  direction,
  chance_low: 0,
  chance_high: 1,
  expected_yes: 0,
});

describe('stripSummary (roadmap D47)', () => {
  it('names a lean from exactly 10 answers (MIN_N_BAND)', () => {
    expect(stripSummary([strip(80, 'overconfident', 10)])).toBe('By range, low to high: 80 to 100%, too sure.');
  });

  it('names no lean for a range under 10 (R4)', () => {
    expect(stripSummary([strip(80, 'overconfident', 9), strip(60, 'calibrated', 10)])).toBe(
      'By range, low to high: 60 to 80%, no clear lean; 80 to 100%, too few to read yet.',
    );
  });

  it('reads each range low to high, in the chart title’s words', () => {
    expect(stripSummary([strip(80, 'overconfident'), strip(0, 'underconfident'), strip(40, 'calibrated')])).toBe(
      'By range, low to high: 0 to 20%, too cautious; 40 to 60%, no clear lean; 80 to 100%, too sure.',
    );
  });
});
