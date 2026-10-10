import type { WrappedSummary } from '@/engine/wrapped';
import type { BucketStat } from '@/types';

import {
  expectedLine,
  receiptLine,
  streakLine,
  wrappedCardSummary,
  wrappedStory,
} from './wrappedCopy';

// Roadmap step 48: counts against counts, in place of "86% came in".
describe('expectedLine', () => {
  it('sets what the stated numbers expected beside what happened', () => {
    expect(expectedLine({ resolved: 7, happened: 6, expected: 5.1 })).toBe(
      '6 happened. You expected about\u00A05.',
    );
    expect(expectedLine({ resolved: 146, happened: 93, expected: 96.6 })).toBe(
      '93 happened. You expected about\u00A097.',
    );
  });

  it('reads naturally at the edges', () => {
    expect(expectedLine({ resolved: 2, happened: 0, expected: 0.3 })).toBe(
      'None happened. You expected less than\u00A01.',
    );
    expect(expectedLine({ resolved: 3, happened: 0, expected: 2.4 })).toBe(
      'None happened. You expected 2\u00A0or\u00A03.',
    );
  });

  it('stays quiet for a single resolution, which the receipt already says', () => {
    expect(expectedLine({ resolved: 1, happened: 1, expected: 0.7 })).toBeNull();
  });
});

describe('receiptLine', () => {
  it('counts a mixed bucket', () => {
    expect(receiptLine({ low: 80, high: 100, said: 3, happened: 2 })).toBe(
      'You said 80–100% 3 times. 2 of 3 happened.',
    );
  });

  it('reads naturally at the edges', () => {
    expect(receiptLine({ low: 60, high: 80, said: 1, happened: 1 })).toBe(
      'You said 60–80% once. It happened.',
    );
    expect(receiptLine({ low: 60, high: 80, said: 1, happened: 0 })).toBe(
      "You said 60–80% once. It didn't.",
    );
    expect(receiptLine({ low: 40, high: 60, said: 2, happened: 2 })).toBe(
      'You said 40–60% 2 times. Both happened.',
    );
    expect(receiptLine({ low: 80, high: 100, said: 4, happened: 4 })).toBe(
      'You said 80–100% 4 times. All 4 happened.',
    );
    expect(receiptLine({ low: 0, high: 20, said: 3, happened: 0 })).toBe(
      'You said 0–20% 3 times. None of them happened.',
    );
  });
});

function bucket(low: number, n: number, yes: number, stated: number): BucketStat {
  const actual = yes / n;
  const gap = stated / 100 - actual;
  return {
    low,
    high: low === 80 ? 100 : low + 20,
    total_resolved: n,
    resolved_yes: yes,
    stated_confidence_mean: stated,
    actual_rate: actual,
    bucket_error: Math.abs(gap),
    direction: gap > 0.05 ? 'overconfident' : gap < -0.05 ? 'underconfident' : 'calibrated',
    chance_low: 0,
    chance_high: 1,
    expected_yes: 0,
  } as BucketStat;
}

function summary(buckets: BucketStat[]): WrappedSummary {
  const resolved = buckets.reduce((s, b) => s + b.total_resolved, 0);
  const yes = buckets.reduce((s, b) => s + b.resolved_yes, 0);
  return {
    span: 'year',
    start: '2026-01-01T06:00:00.000Z',
    end: '2027-01-01T05:59:59.999Z',
    resolved,
    hit_rate: yes / resolved,
    mean_confidence: 68,
    happened: yes,
    expected: (68 * resolved) / 100,
    score: 90,
    direction: 'calibrated',
    score_is_provisional: false,
    categories: [],
    boldest_hit: null,
    biggest_miss: null,
    receipt: null,
    buckets,
  };
}

describe('wrappedStory verdict', () => {
  // The demo account on the web build, 2026-10-04: the year card said "well
  // calibrated" from the averages while Stats said "overconfident at 80–100%".
  it('names the worst well-evidenced bucket instead of letting averages cancel', () => {
    const story = wrappedStory(
      summary([bucket(40, 24, 13, 48), bucket(60, 52, 39, 69), bucket(80, 57, 38, 88)]),
    );
    expect(story.verdict).toBe('This year, you ran overconfident at 80–100%.');
  });

  it('keeps the averages line when every solid bucket is calibrated', () => {
    const story = wrappedStory(summary([bucket(60, 20, 14, 70), bucket(80, 20, 18, 88)]));
    expect(story.verdict).toMatch(/^This year, you ran well calibrated — /);
  });

  it('falls back to the averages when no bucket has enough in it', () => {
    const story = wrappedStory(
      summary([bucket(20, 5, 1, 25), bucket(60, 8, 5, 70), bucket(80, 9, 6, 90)]),
    );
    expect(story.verdict).toMatch(/ — 68% confident on average/);
  });
});

describe('wrappedCardSummary (roadmap step 45)', () => {
  it('joins what the card shows into sentences, skipping empty parts', () => {
    expect(
      wrappedCardSummary({
        title: 'Your week in predictions',
        stat: '4 predictions resolved. 3 happened. You expected about\u00A03.',
        statCount: '4 resolved',
        statRate: '3 happened. You expected about\u00A03.',
        verdict: null,
        receipt: 'You said 80–100% 3 times. 2 of 3 happened.',
        provisionalNote: 'A week is too short for a verdict.',
        note: '1 call under 40% this time. The unlikely end keeps your score honest.',
      }),
    ).toBe(
      'Your week in predictions. 4 predictions resolved. 3 happened. You expected about\u00A03. ' +
        'You said 80–100% 3 times. 2 of 3 happened. A week is too short for a verdict. ' +
        '1 call under 40% this time. The unlikely end keeps your score honest.',
    );
  });
});

// Roadmap D23: the closing note counts calls at the unlikely end, not 35–65%.
describe('wrappedStory note', () => {
  it('counts the calls under 40% in the window', () => {
    const story = wrappedStory(
      summary([bucket(0, 1, 0, 10), bucket(20, 2, 1, 30), bucket(60, 20, 14, 70)]),
    );
    expect(story.note).toBe('3 calls under 40% this time. The unlikely end keeps your score honest.');
  });

  it('says one call in the singular', () => {
    const story = wrappedStory(summary([bucket(20, 1, 0, 25), bucket(80, 20, 18, 88)]));
    expect(story.note).toBe('1 call under 40% this time. The unlikely end keeps your score honest.');
  });

  it('asks for one when there were none, and never mentions a bonus', () => {
    const story = wrappedStory(summary([bucket(40, 3, 2, 50), bucket(80, 20, 18, 88)]));
    expect(story.note).toBe("Nothing under 40% this time. Log something you think won't happen.");
    expect(story.note).not.toMatch(/coin-flip|honest-uncertainty|35/);
  });
});

// Roadmap step 63: the daily streak travels with the recap.
describe('streakLine', () => {
  it('names a run of two days or more', () => {
    expect(streakLine({ resolved: 40, provisional: false, streak: 15 })).toBe('15-day streak');
    expect(streakLine({ resolved: 40, provisional: false, streak: 2 })).toBe('2-day streak');
  });

  it('stays off the card for one day or none', () => {
    expect(streakLine({ resolved: 40, provisional: false, streak: 1 })).toBeNull();
    expect(streakLine({ resolved: 40, provisional: false })).toBeNull();
    expect(streakLine(null)).toBeNull();
  });
});
