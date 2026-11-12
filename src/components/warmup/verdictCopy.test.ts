import { scoreWarmup } from '@/engine/warmup';
import type { WarmupAnswer } from '@/types';

import { answerKeyRow, warmupChartNote, warmupVerdict } from './verdictCopy';

const run = (confidence: number, n: number, correct: number): WarmupAnswer[] =>
  Array.from({ length: n }, (_, i) => ({ confidence, correct: i < correct }));

/** 90% sure on ten and right on five: outside what luck does at 90%. */
const OVERCONFIDENT = run(90, 10, 5);
/** Two answers: too few for any lean. */
const TWO = run(90, 2, 1);

describe('warmupVerdict', () => {
  it('returns null with nothing answered rather than a verdict on no data', () => {
    expect(warmupVerdict(null)).toBeNull();
    expect(warmupVerdict(scoreWarmup([]))).toBeNull();
  });

  it('leads with the counts and reads these ten, not the person', () => {
    const v = warmupVerdict(scoreWarmup(OVERCONFIDENT));
    expect(v?.title).toBe('On these ten, you were overconfident');
    expect(v?.detail).toBe(
      'You said 90% on average. 5\u00A0of\u00A010\u00A0were\u00A0right.',
    );
  });

  it('reads the other direction when confidence trails accuracy', () => {
    const v = warmupVerdict(scoreWarmup(run(55, 10, 10)));
    expect(v?.title).toBe('On these ten, you were underconfident');
  });

  it('names no lean inside what luck does, and says why', () => {
    // 70% on ten, 6 right: the old ±5 rule called this overconfident.
    const v = warmupVerdict(scoreWarmup(run(70, 10, 6)));
    expect(v?.title).toBe('On these ten, no clear lean');
    // Roadmap D36: what did happen, plainly, then why it's no verdict.
    expect(v?.advice).toBe(
      'You expected about 7 right and got 6. On ten answers luck often moves it that far, so it says nothing either way yet. Your own predictions are the real test.',
    );
    expect(warmupVerdict(scoreWarmup(run(70, 10, 7)))?.advice).toBe(
      "You expected about 7 right and got 7: just what you said. Ten answers can't prove that, so your own predictions are the real test.",
    );
    expect(warmupVerdict(scoreWarmup(TWO))?.title).toBe('On these 2, no clear lean');
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
      'You said 85% on average. 2\u00A0of\u00A03\u00A0were\u00A0right.',
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
      expect(v?.detail).toBe('You said 75% on all 10. 5\u00A0of\u00A010\u00A0were\u00A0right.');
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
      expect(v?.detail).toBe('You said 100% on all 10. 10\u00A0of\u00A010\u00A0were\u00A0right.');
      expect(v?.sameNumber).toBeNull();
    });

    it('needs at least three answers to call it a pattern', () => {
      expect(warmupVerdict(scoreWarmup(TWO), TWO)?.detail).toBe(
        'You said 90% on average. 1\u00A0of\u00A02\u00A0were\u00A0right.',
      );
    });
  });

  it("says the overconfident advice the way it's meant", () => {
    expect(warmupVerdict(scoreWarmup(OVERCONFIDENT))?.advice).toBe(
      "When you felt sure, you were right less often than you thought. Try a lower number when you feel sure.",
    );
  });
});

describe('warmupChartNote', () => {
  it('names the count the headline reads together', () => {
    expect(warmupChartNote(10)).toBe(
      'The read above takes all ten together, which says more than any one band.',
    );
    expect(warmupChartNote(2)).toMatch(/^The read above takes all 2 together/);
  });
});

describe('answerKeyRow', () => {
  const q = {
    id: 'q',
    prompt: 'Which is further north?',
    options: ['Washington, D.C.', 'Lisbon'] as const,
    correctIndex: 0 as const,
    fact: 'Lisbon is at 38.7°N.',
  };

  it('adds no second full stop after an answer that ends in one', () => {
    expect(answerKeyRow(q, { confidence: 70, correct: true }).spoken).toBe(
      'Which is further north? Washington, D.C. You got it, 70% sure. Lisbon is at 38.7°N.',
    );
  });

  it('ends a plain answer with one', () => {
    const lisbon = { ...q, correctIndex: 1 as const };
    expect(answerKeyRow(lisbon, { confidence: 60, correct: false }).spoken).toBe(
      'Which is further north? Lisbon. You picked “Washington, D.C.”, 60% sure. Lisbon is at 38.7°N.',
    );
  });
});
