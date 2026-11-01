import { holdRanges, holdTarget } from './holdRanges';

describe('holdRanges (roadmap step 70)', () => {
  it('joins the dash of every numeric range to its numbers', () => {
    expect(holdRanges("You're overconfident at 80–100%")).toBe(
      "You're overconfident at 80\u2060–\u2060100%",
    );
    expect(holdRanges('0–20% and 40–60%')).toBe('0\u2060–\u206020% and 40\u2060–\u206060%');
  });

  it('leaves a dash between words alone, and reads the same without the joiners', () => {
    expect(holdRanges('Sharp – mostly')).toBe('Sharp – mostly');
    expect(holdRanges('In your 60–80% range').replace(/\u2060/g, '')).toBe('In your 60–80% range');
  });
});

// Roadmap D33: "→ Tracker" became "to reach Tracker", which at 320pt left
// "Tracker" alone on a line.
describe('holdTarget', () => {
  const NBSP = String.fromCharCode(0xa0);
  it('holds "to reach" to its target, leaving the space before "to" to break', () => {
    expect(holdTarget('3 more resolved to reach Tracker')).toBe(
      `3 more resolved to${NBSP}reach${NBSP}Tracker`,
    );
  });

  it('leaves a hint with no target alone', () => {
    expect(holdTarget('120 resolved, top badge reached')).toBe('120 resolved, top badge reached');
  });
});
