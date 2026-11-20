import { LOCAL_ONLY_BELOW_AGE, type AgeBucket } from '@/types';

import { isUnder13Band } from './ageBand';

const band = (lowerBound: number | null, upperBound: number | null): AgeBucket => ({
  lowerBound,
  upperBound,
});

/** Malformed input, as the type wouldn't allow it. */
const raw = (value: unknown): AgeBucket => value as AgeBucket;

// The table in docs/design/research/under-13-2026-11.md, call 1, widened by
// the main session's review call of 2026-11-19: a band counts when it can
// include someone under 13 and has a top. Apple says a region's gates "may
// differ from the age gates you specify", so (null, 15), (null, 17) and
// (12, 15) count too (they read false until that call).
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
    [band(null, 15)],
    [band(null, 17)],
    [band(12, 15)],
  ])('is true for %p', (bucket) => {
    expect(isUnder13Band(bucket)).toBe(true);
  });

  it.each<[AgeBucket | null | undefined]>([
    [band(13, 15)],
    [band(13, 16)],
    [band(16, 17)],
    [band(18, null)],
    [band(null, null)],
    [null],
    [undefined],
  ])('is false for %p', (bucket) => {
    expect(isUnder13Band(bucket)).toBe(false);
  });

  it('a band with no top is never under 13, whatever its lower bound', () => {
    expect(isUnder13Band(band(12, null))).toBe(false);
    expect(isUnder13Band(band(0, null))).toBe(false);
    expect(isUnder13Band(band(13, null))).toBe(false);
  });

  it('a band with a top counts whenever its lower bound is open or under 13, a wide top included', () => {
    expect(isUnder13Band(band(null, 25))).toBe(true);
    expect(isUnder13Band(band(12, 12))).toBe(true);
    expect(isUnder13Band(band(13, 13))).toBe(false);
  });

  it('reads an absent bound as open, like null', () => {
    expect(isUnder13Band(raw({ upperBound: 12 }))).toBe(true);
    expect(isUnder13Band(raw({ upperBound: 15 }))).toBe(true);
    expect(isUnder13Band(raw({ lowerBound: 18 }))).toBe(false);
    expect(isUnder13Band(raw({}))).toBe(false);
  });
});

// Nothing the app keeps is malformed (src/age/ageRange.ts checks every band),
// so this is the second line: wherever it can't make a band whose lower bound
// says 18 or over local-only, doubt counts as under 13.
describe('isUnder13Band on malformed input: fails closed, never on an 18+ lower bound', () => {
  it.each<[string, AgeBucket]>([
    ['an upper bound that is a string', raw({ lowerBound: null, upperBound: '12' })],
    ['an upper bound that is NaN', band(null, Number.NaN)],
    ['an upper bound that is Infinity', band(null, Number.POSITIVE_INFINITY)],
    ['a lower bound that is a string, under a top of 12', raw({ lowerBound: 'x', upperBound: 12 })],
    ['a lower bound that is NaN, under a top of 17', band(Number.NaN, 17)],
    ['an unreadable upper bound over a lower bound of 13', raw({ lowerBound: 13, upperBound: 'x' })],
    ['an unreadable upper bound over a lower bound of 16', band(16, Number.POSITIVE_INFINITY)],
    ['both bounds unreadable', raw({ lowerBound: 'x', upperBound: 'y' })],
    ['an upper bound that is an object', raw({ lowerBound: null, upperBound: { n: 12 } })],
  ])('%s counts as under 13', (_name, bucket) => {
    expect(isUnder13Band(bucket)).toBe(true);
  });

  it.each<[string, AgeBucket]>([
    ['(14, 12)', band(14, 12)],
    ['(13, 12)', band(13, 12)],
    ['(16, 15)', band(16, 15)],
    ['(17, 0)', band(17, 0)],
  ])('a lower bound above the upper, %s, counts as under 13', (_name, bucket) => {
    expect(isUnder13Band(bucket)).toBe(true);
  });

  it.each<[string, AgeBucket]>([
    ['(18, 12), reversed', band(18, 12)],
    ['(21, 15), reversed', band(21, 15)],
    ["(18, 'x')", raw({ lowerBound: 18, upperBound: 'x' })],
    ['(18, NaN)', band(18, Number.NaN)],
    ['(20, 25)', band(20, 25)],
  ])('a lower bound of 18 or over keeps it false: %s', (_name, bucket) => {
    expect(isUnder13Band(bucket)).toBe(false);
  });

  it('no top stays false even when the lower bound is unreadable', () => {
    expect(isUnder13Band(raw({ lowerBound: 'x', upperBound: null }))).toBe(false);
    expect(isUnder13Band(band(Number.NaN, null))).toBe(false);
  });

  it.each<[string, unknown]>([
    ['a string', '{"lowerBound":null,"upperBound":12}'],
    ['a number', 12],
    ['a boolean', true],
    ['an array', [null, 12]],
    ['an empty array', []],
  ])('a value that is not a band object, %s, counts as under 13', (_name, value) => {
    expect(isUnder13Band(raw(value))).toBe(true);
  });

  it('a band whose bounds throw when read counts as under 13, and nothing is thrown', () => {
    const throwing = raw(
      Object.defineProperty({ lowerBound: null }, 'upperBound', {
        get() {
          throw new Error('unreadable');
        },
      }),
    );
    expect(() => isUnder13Band(throwing)).not.toThrow();
    expect(isUnder13Band(throwing)).toBe(true);
  });
});
