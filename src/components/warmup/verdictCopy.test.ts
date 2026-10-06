import { scoreWarmup } from '@/engine/warmup';
import type { WarmupAnswer } from '@/types';

import { warmupVerdict } from './verdictCopy';

/** Confident and wrong half the time — the overconfident case. */
const OVERCONFIDENT: WarmupAnswer[] = [
  { confidence: 90, correct: true },
  { confidence: 90, correct: false },
];

describe('warmupVerdict', () => {
  it('returns null with nothing answered rather than a verdict on no data', () => {
    expect(warmupVerdict(null)).toBeNull();
    expect(warmupVerdict(scoreWarmup([]))).toBeNull();
  });

  it('states confidence against reality, per the CLAUDE.md headline shape', () => {
    const v = warmupVerdict(scoreWarmup(OVERCONFIDENT));
    expect(v?.title).toBe('You run overconfident');
    expect(v?.detail).toBe(
      'You were 90% confident on average, and right 50% of the time.',
    );
  });

  it('reads the other direction when confidence trails accuracy', () => {
    const v = warmupVerdict(
      scoreWarmup([
        { confidence: 55, correct: true },
        { confidence: 55, correct: true },
      ]),
    );
    expect(v?.title).toBe('You run underconfident');
  });

  it('calls a matched run calibrated', () => {
    const v = warmupVerdict(
      scoreWarmup([
        { confidence: 100, correct: true },
        { confidence: 100, correct: true },
      ]),
    );
    expect(v?.title).toBe('You run well calibrated');
  });

  it('rounds the reported figures for display', () => {
    const v = warmupVerdict(
      scoreWarmup([
        { confidence: 85, correct: true },
        { confidence: 90, correct: true },
        { confidence: 80, correct: false },
      ]),
    );
    // mean 85%, 2 of 3 right = 66.67% → rounded for the headline.
    expect(v?.detail).toBe(
      'You were 85% confident on average, and right 67% of the time.',
    );
  });

  // Roadmap step 49: tapping straight through leaves every answer at the
  // slider's 75%, and the verdict should say so rather than read as a choice.
  describe('one number on every answer', () => {
    const tapThrough = (correct: number): WarmupAnswer[] =>
      Array.from({ length: 10 }, (_, i) => ({ confidence: 75, correct: i < correct }));

    it('says the shared number instead of an average', () => {
      const answers = tapThrough(5);
      const v = warmupVerdict(scoreWarmup(answers), answers);
      expect(v?.detail).toBe('You said 75% on all 10, and were right 50% of the time.');
      expect(v?.sameNumber).toMatch(/^One number for every question/);
    });

    it('stays quiet when the numbers vary, or when every answer was right', () => {
      const varied: WarmupAnswer[] = [
        { confidence: 75, correct: true },
        { confidence: 75, correct: false },
        { confidence: 90, correct: true },
      ];
      expect(warmupVerdict(scoreWarmup(varied), varied)?.sameNumber).toBeNull();

      const allRight = tapThrough(10).map((a) => ({ ...a, confidence: 100 }));
      const v = warmupVerdict(scoreWarmup(allRight), allRight);
      expect(v?.detail).toBe('You said 100% on all 10, and were right 100% of the time.');
      expect(v?.sameNumber).toBeNull();
    });

    it('needs at least three answers to call it a pattern', () => {
      expect(warmupVerdict(scoreWarmup(OVERCONFIDENT), OVERCONFIDENT)?.detail).toBe(
        'You were 90% confident on average, and right 50% of the time.',
      );
    });
  });

  it("says the overconfident advice the way it's meant", () => {
    expect(warmupVerdict(scoreWarmup(OVERCONFIDENT))?.advice).toBe(
      "When you feel sure, you're right less often than you think. Try shading your confidence down.",
    );
  });
});
