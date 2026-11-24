import {
  firstLookLine,
  paceSpan,
  plainCountsLine,
  TODAY_PACE_MAX_DAYS,
  todayEstimateLine,
  unlockEstimateLine,
} from './beforeScoreCopy';

// Roadmap D53 (blind playtest 2026-11-09b, finding 2).
describe('plainCountsLine', () => {
  it('says what was said and what happened, with no verdict', () => {
    expect(plainCountsLine({ resolved: 9, happened: 7, mean_stated: 88.3 })).toBe(
      'You said about 88%, and 7 of 9 scored answers happened. Too early to read.',
    );
    expect(plainCountsLine({ resolved: 1, happened: 0, mean_stated: 80 })).toBe(
      'Its one scored answer: you said 80%, and it didn’t happen. Too early to read.',
    );
    expect(plainCountsLine({ resolved: 1, happened: 1, mean_stated: 80 })).toMatch(/and it happened\./);
    expect(plainCountsLine({ resolved: 0, happened: 0, mean_stated: 0 })).toBeNull();
  });
});

describe('unlockEstimateLine', () => {
  it('rounds the span and gives a date', () => {
    expect(paceSpan(1)).toBe('about 1 day');
    expect(paceSpan(9)).toBe('about 9 days');
    expect(paceSpan(20)).toBe('about 3 weeks');
    expect(paceSpan(126)).toBe('about 4 months');
    expect(paceSpan(532)).toBe('more than a year');
    const now = new Date(2026, 10, 9, 12);
    const line = unlockEstimateLine({ remaining: 13, days: 20, at: new Date(2026, 10, 29, 12) }, now);
    expect(unlockEstimateLine({ remaining: 19, days: 400, at: new Date(2027, 11, 14, 12) }, now)).toBe(
      'At your recent pace, more than a year.',
    );
    expect(line).toMatch(/^At your recent pace, about 3 weeks \(around (Nov\u00A029|29\u00A0Nov)\)\.$/);
  });
});

// Step 181 (blind playtest 2026-11-14, finding 5): "about 6 weeks" on Today,
// right after a first-week answer, was the round's lowest mood twice.
describe('todayEstimateLine', () => {
  const now = new Date(2026, 10, 9, 12);
  const days = (n: number) => ({
    remaining: 10,
    days: n,
    at: new Date(now.getTime() + n * 24 * 60 * 60 * 1000),
  });

  it('says when only while the unlock is three weeks off or nearer', () => {
    expect(TODAY_PACE_MAX_DAYS).toBe(21);
    expect(todayEstimateLine(days(21), now)).toBe(unlockEstimateLine(days(21), now));
    expect(todayEstimateLine(days(3), now)).toMatch(/^At your recent pace, about 3 days/);
    expect(todayEstimateLine(days(22), now)).toBeNull();
    expect(todayEstimateLine(days(42), now)).toBeNull();
  });
});

// D62 (blind playtest 2026-11-13d, finding 4), worded for D76.
describe('firstLookLine', () => {
  it('gives plain counts from 10 scored answers until the rating unlocks', () => {
    expect(firstLookLine({ resolved: 12, happened: 6, mean_stated: 74.6 })).toBe(
      'First look: you said about 75%, and 6 of 12 happened. Too early to rate.',
    );
    // Counts only, never a lean (D35), however far apart the two are.
    expect(firstLookLine({ resolved: 19, happened: 3, mean_stated: 90 })).toBe(
      'First look: you said about 90%, and 3 of 19 happened. Too early to rate.',
    );
    expect(firstLookLine({ resolved: 19, happened: 3, mean_stated: 90 })).not.toMatch(
      /too sure|too cautious|overconfident|underconfident|calibrated/,
    );
    expect(firstLookLine({ resolved: 9, happened: 6, mean_stated: 70 })).toBeNull();
    expect(firstLookLine({ resolved: 20, happened: 14, mean_stated: 70 })).toBeNull();
    expect(firstLookLine(null)).toBeNull();
  });
});
