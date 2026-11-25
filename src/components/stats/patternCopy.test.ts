import type { BucketStat, Direction } from '@/types';

import { coachSample, furthestOffDetail, furthestOffLine, weekChangeLine } from './patternCopy';

describe('furthestOffLine (roadmap D37)', () => {
  const finance = {
    category: 'finance' as const,
    resolved: 21,
    happened: 9,
    mean_stated: 84.7,
    actual_rate: 9 / 21,
    direction: 'overconfident' as const,
  };

  // D76: the page keeps what was said and what happened.
  it('names the category, what was said and what happened', () => {
    expect(furthestOffLine(finance)).toBe(
      'Furthest off: Finance. You said about 85%, and 9 of 21 happened.',
    );
    expect(furthestOffLine(finance, 'Your own category')).toBe(
      'Furthest off: Your own category. You said about 85%, and 9 of 21 happened.',
    );
  });

  // D76: what would have matched moves behind a tap, in its own words.
  it('keeps what would have matched for the detail', () => {
    expect(furthestOffLine(finance)).not.toMatch(/would have matched/);
    expect(furthestOffDetail(finance)).toBe('About 45% would have matched.');
  });
});

describe('weekChangeLine (roadmap D37)', () => {
  it('says the change since last week and the answers behind it', () => {
    expect(weekChangeLine({ before: 80, now: 87, answered: 10 }, 3)).toBe(
      'Up 7 since last week, from 10 answers given since then.',
    );
    expect(weekChangeLine({ before: 88, now: 86, answered: 1 }, 0)).toBe(
      'Down 2 since last week, from 1 answer given since then.',
    );
    expect(weekChangeLine({ before: 86, now: 86, answered: 4 }, 3)).toBe(
      'No change since last week, from 4 answers given since then.',
    );
  });

  it('says when the change is within its give-or-take', () => {
    expect(weekChangeLine({ before: 86, now: 88, answered: 6 }, 3)).toBe(
      'Up 2 since last week, from 6 answers given since then, within its give\u2060-\u2060or\u2060-\u2060take.',
    );
  });
});

describe('coachSample (roadmap D37)', () => {
  const bucket = (low: number, n: number, yes: number, direction: Direction): BucketStat => ({
    low,
    high: low + 20,
    total_resolved: n,
    resolved_yes: yes,
    stated_confidence_mean: low + 10,
    actual_rate: yes / n,
    bucket_error: 0,
    direction,
    chance_low: 0,
    chance_high: 1,
    expected_yes: 0,
  });

  it('writes one card from the range used most', () => {
    expect(
      coachSample([bucket(60, 55, 42, 'underconfident'), bucket(80, 20, 8, 'overconfident')], 10),
    ).toEqual({
      figure: '76%',
      label: 'came true at 60–80%',
      message:
        "Your 60–80% calls came true more often than you said: 42 of 55. It's the range you use most, so it moves your rating most.",
    });
  });

  it('has nothing to say without a range that has enough answers', () => {
    expect(coachSample([bucket(60, 9, 6, 'calibrated')], 10)).toBeNull();
  });

  // Roadmap D57 (blind playtest 2026-11-10, run 7): "about as often as you
  // said" over 12 of 21 at about 66% read as wrong; inside luck, the counts.
  // Record audit 2026-11-10: a range also counts as calibrated within 5 points
  // outside its luck range (many answers); that isn't luck.
  it('says "within 5 points" rather than luck for a range outside its grey bar', () => {
    const near = {
      ...bucket(60, 200, 131, 'calibrated'),
      stated_confidence_mean: 70,
      expected_yes: 140,
      chance_low: 0.66,
      chance_high: 0.74,
    };
    expect(coachSample([near], 10)?.message).toBe(
      "Your 60–80% calls came true 131 of 200, against about\u00A0140 your numbers expected, within 5 points of what you said. It's the range you use most, so it holds your rating up.",
    );
  });

  it('sets the counts against what the numbers expected for a range inside luck', () => {
    const inside = { ...bucket(60, 21, 12, 'calibrated'), stated_confidence_mean: 66, expected_yes: 13.86 };
    expect(coachSample([inside], 10)?.message).toBe(
      "Your 60–80% calls came true 12 of 21, against about\u00A014 your numbers expected, within what luck moves. It's the range you use most, so it holds your rating up.",
    );
  });
});

// Step 173: the miss and the category's badge, together, so Insights doesn't
// read as contradicting itself (blind playtest 2026-11-12f, finding 5).
describe('furthestOffLine with the badge it sits beside', () => {
  const miss = {
    category: 'health' as const,
    resolved: 22,
    happened: 15,
    mean_stated: 88,
    actual_rate: 15 / 22,
    direction: 'overconfident' as const,
  };
  it('says the gap is already in the score, which still clears the tier', () => {
    expect(furthestOffLine(miss)).toBe('Furthest off: Health. You said about 88%, and 15 of 22 happened.');
    expect(furthestOffDetail(miss, { level: 'forecaster', score: 80, giveOrTake: 6 })).toBe(
      'About 70% would have matched. That gap is already in its score, 80, which still clears Silver\'s 70 at its low end.',
    );
  });
  it('says why it has only the Bronze badge', () => {
    expect(furthestOffDetail(miss, { level: 'tracker', score: 64, giveOrTake: 6 })).toMatch(
      / Its score, 64, give or take 6, isn't above 70 at its low end yet, so it has the Bronze badge, which counts answers only\.$/,
    );
    expect(furthestOffDetail(miss, { level: 'tracker', score: 64, giveOrTake: 0 })).toMatch(
      / Its score, 64, isn't above 70/,
    );
  });
});
