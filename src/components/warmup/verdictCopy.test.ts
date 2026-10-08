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
    expect(v?.title).toBe('On these 2, you were overconfident');
    expect(v?.detail).toBe(
      'You said 90% on average. 1 of 2 were right.',
    );
  });

  it('reads the other direction when confidence trails accuracy', () => {
    const v = warmupVerdict(
      scoreWarmup([
        { confidence: 55, correct: true },
        { confidence: 55, correct: true },
      ]),
    );
    expect(v?.title).toBe('On these 2, you were underconfident');
  });

  it('calls a matched run calibrated', () => {
    const v = warmupVerdict(
      scoreWarmup([
        { confidence: 100, correct: true },
        { confidence: 100, correct: true },
      ]),
    );
    expect(v?.title).toBe('On these 2, you were well calibrated');
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
      'You said 85% on average. 2 of 3 were right.',
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
      expect(v?.detail).toBe('You said 75% on all 10. 5 of 10 were right.');
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
      expect(v?.detail).toBe('You said 100% on all 10. 10 of 10 were right.');
      expect(v?.sameNumber).toBeNull();
    });

    it('needs at least three answers to call it a pattern', () => {
      expect(warmupVerdict(scoreWarmup(OVERCONFIDENT), OVERCONFIDENT)?.detail).toBe(
        'You said 90% on average. 1 of 2 were right.',
      );
    });
  });

  it("says the overconfident advice the way it's meant", () => {
    expect(warmupVerdict(scoreWarmup(OVERCONFIDENT))?.advice).toBe(
      "When you felt sure, you were right less often than you thought. Try shading your confidence down.",
    );
  });

  // Roadmap D18 (1): the ten are random draws, so the note is about sample size.
  it('says ten is a small sample under an overconfident verdict only', () => {
    expect(warmupVerdict(scoreWarmup(OVERCONFIDENT))?.sampleNote).toBe(
      'Ten questions is a small sample, and trivia says little about your plans. ' +
        'Your own predictions are the real test.',
    );
    const calibrated = scoreWarmup([
      { confidence: 100, correct: true },
      { confidence: 100, correct: true },
    ]);
    expect(warmupVerdict(calibrated)?.sampleNote).toBeNull();
    const under = scoreWarmup([
      { confidence: 55, correct: true },
      { confidence: 55, correct: true },
    ]);
    expect(warmupVerdict(under)?.sampleNote).toBeNull();
  });
});
