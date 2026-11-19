import { LOCAL_ONLY_BELOW_AGE, type AgeBucket } from '@/types';

import { isUnder13Band } from './ageBand';

const band = (lowerBound: number | null, upperBound: number | null): AgeBucket => ({
  lowerBound,
  upperBound,
});

// The table in docs/design/research/under-13-2026-11.md, call 1: both of
// Apple's readings of an under-13 upper bound (12 and 13) count, and a band
// that may include a child under 13 counts even when a region's gate is why.
describe('isUnder13Band (D70)', () => {
  it('draws the line at 13', () => {
    expect(LOCAL_ONLY_BELOW_AGE).toBe(13);
  });

  it.each<[AgeBucket]>([
    [band(null, 12)],
    [band(null, 11)],
    [band(9, 12)],
    [band(null, 13)],
    [band(12, 13)],
  ])('is true for %p', (bucket) => {
    expect(isUnder13Band(bucket)).toBe(true);
  });

  it.each<[AgeBucket | null | undefined]>([
    [band(13, 15)],
    [band(13, 16)],
    [band(16, 17)],
    [band(18, null)],
    [band(null, 15)],
    [band(null, 17)],
    [null],
    [undefined],
  ])('is false for %p', (bucket) => {
    expect(isUnder13Band(bucket)).toBe(false);
  });

  it('reads an absent lower bound as open, like null', () => {
    expect(isUnder13Band({ upperBound: 12 } as unknown as AgeBucket)).toBe(true);
  });

  it('is false for bounds that are not numbers', () => {
    expect(isUnder13Band({ lowerBound: null, upperBound: '12' } as unknown as AgeBucket)).toBe(false);
    expect(isUnder13Band({ lowerBound: null, upperBound: Number.NaN })).toBe(false);
    expect(isUnder13Band({ lowerBound: 'x', upperBound: 12 } as unknown as AgeBucket)).toBe(false);
    expect(isUnder13Band(band(null, null))).toBe(false);
  });
});
