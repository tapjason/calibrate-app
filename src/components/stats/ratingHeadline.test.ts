import type { UserStat } from '@/types';

import { weekChangeLine } from './patternCopy';
import {
  chartNamesLean,
  perfectLine,
  perfectShortLine,
  ratingDetailLines,
  ratingHeadline,
  ratingMeaningLine,
  ratingPointsLine,
  spreadThinLine,
  weekChangeShortLine,
} from './ratingHeadline';

const userStat = (overrides: Partial<UserStat> = {}): UserStat => ({
  user_id: 'u1',
  calibration_rating: 0,
  total_predictions: 0,
  total_resolved: 0,
  current_streak: 0,
  rating_is_provisional: true,
  ...overrides,
});

describe('ratingHeadline', () => {
  it('returns null when there are no stats', () => {
    expect(ratingHeadline(null)).toBeNull();
  });

  it('reports remaining resolutions while provisional (MIN_N_OVERALL=20)', () => {
    expect(ratingHeadline(userStat({ total_resolved: 8 }))).toEqual({
      provisional: true,
      remaining: 12,
    });
  });

  it('never reports a negative remaining', () => {
    // Defensive: if the flag is stale-true past the threshold, clamp at 0.
    expect(
      ratingHeadline(userStat({ total_resolved: 25, rating_is_provisional: true })),
    ).toEqual({ provisional: true, remaining: 0 });
  });

  it('rounds and headlines the rating once non-provisional', () => {
    expect(
      ratingHeadline(
        userStat({
          calibration_rating: 82.6,
          total_resolved: 40,
          rating_is_provisional: false,
        }),
      ),
    ).toEqual({ provisional: false, rating: 83 });
  });
});

// Step 173: "is 86 good?", in points. 100 − rating is the count-weighted
// average gap, range by range (CLAUDE.md's formula).
describe('ratingMeaningLine', () => {
  it('says the average gap from the rounded rating, so the two add to 100', () => {
    expect(ratingMeaningLine(86)).toBe(
      'Range by range, what you said averaged about 14 points away from how often those things happened, each range counting by how many answers it holds.',
    );
    expect(ratingMeaningLine(85.5)).toMatch(/about 14 points/);
    expect(ratingMeaningLine(99)).toBe(
      'Range by range, what you said averaged about 1 point away from how often those things happened, each range counting by how many answers it holds.',
    );
    expect(ratingMeaningLine(100)).toBe(
      'Range by range, what you said matched how often those things happened.',
    );
  });
});

// D76: the line under Insights' rating, the same gap in fewer words.
describe('ratingPointsLine', () => {
  it('says the gap from the rounded rating, as the full line does', () => {
    expect(ratingPointsLine(86)).toBe('On average you’re about 14 points off.');
    expect(ratingPointsLine(85.5)).toBe('On average you’re about 14 points off.');
    expect(ratingPointsLine(99)).toBe('On average you’re about 1 point off.');
    expect(ratingPointsLine(100)).toBe('Your numbers match what happened.');
    // The same figure as the full line in How scoring works.
    for (const r of [40, 72, 86, 99]) {
      const gap = ratingPointsLine(r).match(/about (\d+) point/)?.[1];
      expect(ratingMeaningLine(r)).toContain(`about ${gap} point`);
    }
  });
});

// Step 173: why no badge, when the answers are spread thin. Worded for D76.
describe('spreadThinLine', () => {
  it('says so when the total would have earned one in a single category', () => {
    expect(spreadThinLine(73, [7, 6, 5, 6, 7, 5, 6, 5, 6, 5, 5, 5, 5, 0], 20)).toBe(
      'Badges need 20 scored answers in one category. Your 73 are spread over 13, so none is there yet.',
    );
  });
  it('says nothing under 20 in all, with one category, or once one has 20', () => {
    expect(spreadThinLine(15, [8, 7], 20)).toBeNull();
    expect(spreadThinLine(19, [19], 20)).toBeNull();
    expect(spreadThinLine(30, [20, 10], 20)).toBeNull();
  });
});

describe('perfectLine (D62)', () => {
  const ref = { typical: 86, low: 80, high: 91 };
  it('says what perfect calibration scores on the same answers, and where the rating sits', () => {
    expect(perfectLine(85, ref, 20)).toBe(
      'Even perfectly calibrated, 20 answers like yours would typically score about 86, since luck alone moves each range. At this count, your score can’t be told apart from perfect calibration.',
    );
    expect(perfectLine(72, ref, 20, true)).toMatch(/Your score is further off than luck alone explains\.$/);
    expect(perfectLine(95, ref, 20)).toMatch(/Your score is above that, which luck can do too\.$/);
  });

  // Record audit of step 178: never "can't be told apart" over a chart that
  // names a lean, nor "further off than luck" over "no clear lean".
  it('never contradicts the chart', () => {
    expect(perfectLine(85, ref, 20, true)).toMatch(/though the chart shows a range that leans\.$/);
    expect(perfectLine(85, ref, 20, true)).not.toMatch(/told apart/);
    expect(perfectLine(72, ref, 20, false)).toMatch(/each range\.$/);
    expect(chartNamesLean('both')).toBe(true);
    expect(chartNamesLean('calibrated')).toBe(false);
    expect(chartNamesLean(null)).toBe(false);
  });
});

// D76: Insights keeps one short line of it, and only where the full line
// says the score can't be told apart from perfect calibration.
describe('perfectShortLine (D76)', () => {
  const ref = { typical: 86, low: 80, high: 91 };

  it('says it only where the full line ends "can’t be told apart"', () => {
    expect(perfectShortLine(85, ref, 20)).toBe('With 20 answers, that’s about as good as anyone can tell.');
    expect(perfectLine(85, ref, 20)).toMatch(/can’t be told apart from perfect calibration\.$/);
    // The edges of the middle 80% count as inside, as the full line has it.
    expect(perfectShortLine(80, ref, 20)).not.toBeNull();
    expect(perfectShortLine(91, ref, 20)).not.toBeNull();
    expect(perfectShortLine(85, ref, 1234)).toMatch(/^With 1\D234 answers, /);
  });

  it('says nothing in the other three cases', () => {
    // Above the range.
    expect(perfectShortLine(95, ref, 20)).toBeNull();
    // Within luck, while the chart names a lean.
    expect(perfectShortLine(85, ref, 20, true)).toBeNull();
    // Further off than luck, and below it with no lean.
    expect(perfectShortLine(72, ref, 20, true)).toBeNull();
    expect(perfectShortLine(72, ref, 20, false)).toBeNull();
  });

  // Over many ratings: the short line shows exactly where the full one says
  // "can't be told apart", so the page never claims more than it did.
  it('matches the full line case for case', () => {
    for (const leans of [false, true]) {
      for (let r = 60; r <= 100; r++) {
        const full = perfectLine(r, ref, 20, leans);
        expect(perfectShortLine(r, ref, 20, leans) !== null).toBe(/told apart/.test(full));
      }
    }
  });
});

// D76: the news alone on Insights; the full sentence is in How scoring works.
describe('weekChangeShortLine (D76)', () => {
  // Record audit 2026-11-23: only a change beyond the give-or-take is news.
  it('says the change only when it is beyond the give-or-take', () => {
    expect(weekChangeShortLine({ before: 84, now: 88, answered: 6 }, 3)).toBe('Up 4 since last week.');
    expect(weekChangeShortLine({ before: 90, now: 86, answered: 1 }, 3)).toBe('Down 4 since last week.');
    // No give-or-take known: any change is beyond it.
    expect(weekChangeShortLine({ before: 84, now: 86, answered: 6 }, 0)).toBe('Up 2 since last week.');
  });

  it('reads a change within the give-or-take as about the same', () => {
    expect(weekChangeShortLine({ before: 84, now: 86, answered: 6 }, 3)).toBe('About the same as last week.');
    expect(weekChangeShortLine({ before: 88, now: 86, answered: 1 }, 3)).toBe('About the same as last week.');
    // At the give-or-take exactly, as the full sentence says "within" there.
    expect(weekChangeShortLine({ before: 83, now: 86, answered: 2 }, 3)).toBe('About the same as last week.');
  });

  it('reads no change as about the same', () => {
    expect(weekChangeShortLine({ before: 86, now: 86, answered: 4 }, 3)).toBe('About the same as last week.');
    expect(weekChangeShortLine({ before: 86, now: 86, answered: 4 }, 0)).toBe('About the same as last week.');
  });

  it('agrees with the full sentence on what is within the give-or-take', () => {
    for (const giveOrTake of [0, 2, 3, 5]) {
      for (let delta = -7; delta <= 7; delta += 1) {
        const change = { before: 80, now: 80 + delta, answered: 5 };
        const full = weekChangeLine(change, giveOrTake);
        const short = weekChangeShortLine(change, giveOrTake);
        expect(short === 'About the same as last week.').toBe(delta === 0 || /within its/.test(full));
      }
    }
  });
});

// D76: the person's own lines on top of How scoring works, in full.
describe('ratingDetailLines (D76)', () => {
  const unlocked = userStat({ total_resolved: 20, calibration_rating: 85.4, rating_is_provisional: false });
  const ref = { typical: 86, low: 80, high: 91 };

  it('carries the points line, the perfect line, the give-or-take and since last week, in order', () => {
    expect(
      ratingDetailLines({
        userStat: unlocked,
        perfect: ref,
        ratingRange: { giveOrTake: 3, low: 82, high: 88 },
        weekChange: { before: 83, now: 85, answered: 6 },
      }),
    ).toEqual([
      'Your rating is 85. Range by range, what you said averaged about 15 points away from how often those things happened, each range counting by how many answers it holds.',
      'Even perfectly calibrated, 20 answers like yours would typically score about 86, since luck alone moves each range. At this count, your score can’t be told apart from perfect calibration.',
      'Give or take 3 points with this many predictions.',
      'Up 2 since last week, from 6 answers given since then, within its give⁠-⁠or⁠-⁠take.',
    ]);
  });

  it('keeps every ending of the perfect line', () => {
    const perfectOf = (rating: number, chartLeans: boolean) =>
      ratingDetailLines({
        userStat: userStat({ total_resolved: 20, calibration_rating: rating, rating_is_provisional: false }),
        perfect: ref,
        chartLeans,
      })[1];
    expect(perfectOf(95, false)).toMatch(/Your score is above that, which luck can do too\.$/);
    expect(perfectOf(85, true)).toMatch(/though the chart shows a range that leans\.$/);
    expect(perfectOf(72, true)).toMatch(/Your score is further off than luck alone explains\.$/);
    expect(perfectOf(72, false)).toMatch(/since luck alone moves each range\.$/);
  });

  it('leaves out what it lacks, one point in the singular', () => {
    expect(ratingDetailLines({ userStat: unlocked })).toEqual([
      'Your rating is 85. Range by range, what you said averaged about 15 points away from how often those things happened, each range counting by how many answers it holds.',
    ]);
    expect(
      ratingDetailLines({ userStat: unlocked, ratingRange: { giveOrTake: 1, low: 84, high: 86 } })[1],
    ).toBe('Give or take 1 point with this many predictions.');
    // A give-or-take of 0 is none, and since last week then has no "within".
    expect(
      ratingDetailLines({
        userStat: unlocked,
        ratingRange: { giveOrTake: 0, low: 85, high: 85 },
        weekChange: { before: 84, now: 85, answered: 2 },
      }),
    ).toEqual([
      expect.stringMatching(/^Your rating is 85\./),
      'Up 1 since last week, from 2 answers given since then.',
    ]);
  });

  // CLAUDE.md: no number before the rating unlocks.
  it('says nothing while the rating is provisional or missing', () => {
    expect(
      ratingDetailLines({
        userStat: userStat({ total_resolved: 12, calibration_rating: 80 }),
        perfect: ref,
        ratingRange: { giveOrTake: 9, low: 71, high: 89 },
        weekChange: { before: 78, now: 80, answered: 4 },
      }),
    ).toEqual([]);
    expect(ratingDetailLines({ userStat: null })).toEqual([]);
  });
});
