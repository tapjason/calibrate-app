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

// Step 173: the comparison says whether the gap is more than luck.
describe('brierLine with its luck check', () => {
  const base = { rate: 0.64, score: 0.2304 };
  it('says about the same, and that it could be luck, on a small gap', () => {
    expect(brierLine(0.2213, base, { edge: 'about_same', scored: 20 })).toBe(
      'Brier score 0.22, lower is better. Saying 64% every time, how often your calls came true, would score about the same, 0.23; with 20 answers a gap this small could be luck.',
    );
  });
  it('says only that they are about the same when they print alike', () => {
    expect(brierLine(0.2283, base, { edge: 'alike', scored: 500 })).toBe(
      'Brier score 0.23, lower is better. Saying 64% every time, how often your calls came true, would score about the same, 0.23.',
    );
  });

  it('says which way when the gap is more than luck', () => {
    expect(brierLine(0.15, base, { edge: 'better', scored: 150 })).toMatch(
      /would score 0\.23, so your numbers said more than your base rate\.$/,
    );
    expect(brierLine(0.3, base, { edge: 'worse', scored: 150 })).toMatch(
      /so your numbers said less than your base rate would have\.$/,
    );
  });
});
