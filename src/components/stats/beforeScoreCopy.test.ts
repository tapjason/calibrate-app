import { firstLookLine, paceSpan, plainCountsLine, unlockEstimateLine } from './beforeScoreCopy';

// Roadmap D53 (blind playtest 2026-11-09b, finding 2).
describe('plainCountsLine', () => {
  it('says what was said and what happened, with no verdict', () => {
    expect(plainCountsLine({ resolved: 9, happened: 7, mean_stated: 88.3 })).toBe(
      'You said about 88% on average, and 7 of the 9 scored predictions happened. Too few to read yet.',
    );
    expect(plainCountsLine({ resolved: 1, happened: 0, mean_stated: 80 })).toBe(
      'Its one scored prediction: you said 80%, and it didn’t happen. Too few to read yet.',
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

// D62 (blind playtest 2026-11-13d, finding 4).
describe('firstLookLine', () => {
  it('gives plain counts from 10 scored answers until the rating unlocks', () => {
    expect(firstLookLine({ resolved: 12, happened: 6, mean_stated: 74.6 })).toBe(
      'First look: you said about 75% on average, and 6 of your 12 scored predictions happened. Too few to rate yet.',
    );
    expect(firstLookLine({ resolved: 9, happened: 6, mean_stated: 70 })).toBeNull();
    expect(firstLookLine({ resolved: 20, happened: 14, mean_stated: 70 })).toBeNull();
    expect(firstLookLine(null)).toBeNull();
  });
});
