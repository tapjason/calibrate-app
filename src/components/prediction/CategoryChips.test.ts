import type { Category } from '@/types';

import { CATEGORY_CHIPS_COLLAPSE_AFTER, visibleCategories } from './CategoryChips';

const many = (n: number): Category[] =>
  Array.from({ length: n }, (_, i) => `c-${i}` as Category);

// Playtest 2026-11-08, finding 13: thirteen chips pushed Log's confidence and
// due date most of the way down the sheet.
describe('visibleCategories', () => {
  it('shows every choice up to the limit', () => {
    const options = many(CATEGORY_CHIPS_COLLAPSE_AFTER);
    expect(visibleCategories(options, null, false)).toEqual(options);
  });

  it('shows the first six past the limit', () => {
    const options = many(13);
    expect(visibleCategories(options, null, false)).toEqual(options.slice(0, 6));
  });

  it('keeps the chosen one in view wherever it is', () => {
    const options = many(13);
    expect(visibleCategories(options, options[10], false)).toEqual([
      ...options.slice(0, 6),
      options[10],
    ]);
    expect(visibleCategories(options, options[2], false)).toEqual(options.slice(0, 6));
  });

  it('shows everything once expanded', () => {
    const options = many(13);
    expect(visibleCategories(options, options[10], true)).toEqual(options);
  });
});
