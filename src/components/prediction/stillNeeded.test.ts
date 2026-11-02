import { stillNeeded } from './stillNeeded';

describe('stillNeeded', () => {
  it('names what Save is waiting for, in the form order', () => {
    expect(stillNeeded({ title: false, category: false, confidence: false })).toBe(
      'To save, add the prediction, a category and a confidence.',
    );
    expect(stillNeeded({ title: true, category: false, confidence: false })).toBe(
      'To save, add a category and a confidence.',
    );
    expect(stillNeeded({ title: true, category: true, confidence: false })).toBe(
      'To save, add a confidence.',
    );
  });

  it('is null when nothing is missing', () => {
    expect(stillNeeded({ title: true, category: true, confidence: true })).toBeNull();
  });

  // Edit has a title and a category, and no confidence to set.
  it('asks only about the fields a form has', () => {
    expect(stillNeeded({ title: false, category: true })).toBe('To save, add the prediction.');
    expect(stillNeeded({ title: true, category: true })).toBeNull();
  });
});
