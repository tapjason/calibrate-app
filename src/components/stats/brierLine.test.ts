import { brierLine } from './brierLine';

describe('brierLine', () => {
  // Roadmap D35: the yardstick is the person's own base rate.
  it('says the score beside what saying the base rate every time would score', () => {
    expect(brierLine(0.2213, { rate: 0.64, score: 0.2304 })).toBe(
      'Brier score\u00A00.22, lower is better. Saying 64%\u00A0every time, how often your calls came true, would score\u00A00.23.',
    );
    expect(brierLine(0.25, { rate: 0.5, score: 0.25 })).toMatch(/^Brier score\u00A00\.25, /);
  });
});
