import { receiptLine } from './wrappedCopy';

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
