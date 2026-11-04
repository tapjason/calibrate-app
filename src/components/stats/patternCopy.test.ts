import type { BucketStat, Direction } from '@/types';

import { coachSample, furthestOffLine, weekChangeLine } from './patternCopy';

describe('furthestOffLine (roadmap D37)', () => {
  it('names the category, what was said, what happened and what would have matched', () => {
    expect(
      furthestOffLine({
        category: 'finance',
        resolved: 18,
        happened: 8,
        mean_stated: 84.7,
        actual_rate: 8 / 18,
        direction: 'overconfident',
      }),
    ).toBe('Furthest off: finance. You said about 85%, and 8 of 18 happened. About 45% would have matched.');
  });
});

describe('weekChangeLine (roadmap D37)', () => {
  it('says the change since last week and the answers behind it', () => {
    expect(weekChangeLine({ before: 80, now: 87, answered: 10 }, 3)).toBe(
      'Up 7 since last week, from 10 answers.',
    );
    expect(weekChangeLine({ before: 88, now: 86, answered: 1 }, 0)).toBe(
      'Down 2 since last week, from 1 answer.',
    );
    expect(weekChangeLine({ before: 86, now: 86, answered: 4 }, 3)).toBe(
      'No change since last week, from 4 answers.',
    );
  });

  it('says when the change is within its give-or-take', () => {
    expect(weekChangeLine({ before: 86, now: 88, answered: 6 }, 3)).toBe(
      'Up 2 since last week, from 6 answers, within its give\u2060-\u2060or\u2060-\u2060take.',
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
});
