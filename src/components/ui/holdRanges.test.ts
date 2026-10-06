import { holdRanges } from './holdRanges';

describe('holdRanges (roadmap step 70)', () => {
  it('joins the dash of every numeric range to its numbers', () => {
    expect(holdRanges("You're overconfident at 80–100%")).toBe(
      "You're overconfident at 80⁠–⁠100%",
    );
    expect(holdRanges('0–20% and 40–60%')).toBe('0⁠–⁠20% and 40⁠–⁠60%');
  });

  it('leaves a dash between words alone, and reads the same without the joiners', () => {
    expect(holdRanges('Sharp – mostly')).toBe('Sharp – mostly');
    expect(holdRanges('In your 60–80% range').replace(/⁠/g, '')).toBe('In your 60–80% range');
  });
});
