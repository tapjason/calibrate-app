import { brierLine } from './brierLine';

describe('brierLine', () => {
  it('says the score to two decimals, with what good looks like', () => {
    expect(brierLine(0.1423)).toBe(
      'Brier score\u00A00.14 · lower is better; always saying 50%\u00A0scores\u00A00.25',
    );
    expect(brierLine(0.25)).toMatch(/^Brier score\u00A00\.25 · /);
  });
});
