import { pastOutcomesLine } from './pastOutcomesLine';

const NBSP = String.fromCharCode(0xa0);

/** The line as heard: its no-break spaces read as spaces. */
function read(line: string | null): string | null {
  return line === null ? null : line.split(NBSP).join(' ');
}

describe('pastOutcomesLine (roadmap D32)', () => {
  it('says nothing before an answer', () => {
    expect(pastOutcomesLine(null)).toBeNull();
    expect(pastOutcomesLine({ answered: 0, happened: 0 })).toBeNull();
  });

  // The same shape after a Yes as after a No.
  it('says how a single earlier one came out', () => {
    expect(pastOutcomesLine({ answered: 1, happened: 1 })).toBe(
      'Answered once before: it happened.',
    );
    expect(pastOutcomesLine({ answered: 1, happened: 0 })).toBe(
      "Answered once before: it didn't happen.",
    );
  });

  it('gives the counts from two on', () => {
    expect(read(pastOutcomesLine({ answered: 2, happened: 1 }))).toBe(
      'Answered twice before: happened 1 of 2.',
    );
    expect(read(pastOutcomesLine({ answered: 3, happened: 1 }))).toBe(
      'Answered 3 times before: happened 1 of 3.',
    );
    expect(read(pastOutcomesLine({ answered: 3, happened: 0 }))).toBe(
      'Answered 3 times before: happened 0 of 3.',
    );
    expect(read(pastOutcomesLine({ answered: 12, happened: 12 }))).toBe(
      'Answered 12 times before: happened 12 of 12.',
    );
  });

  it('keeps each count whole across a line break', () => {
    const line = pastOutcomesLine({ answered: 12, happened: 7 });
    expect(line).toContain(`12${NBSP}times`);
    expect(line).toContain(`7${NBSP}of${NBSP}12`);
  });
});
