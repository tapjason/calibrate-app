import { brierLine } from './brierLine';

describe('brierLine', () => {
  it('says the score to two decimals, with what good looks like', () => {
    expect(brierLine(0.1423)).toBe(
      'Brier score 0.14 · lower is better; always saying 50% scores 0.25',
    );
    expect(brierLine(0.25)).toMatch(/^Brier score 0\.25 · /);
  });
});
