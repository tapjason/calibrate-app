import { scoreWarmup } from '@/engine/warmup';
import type { WarmupAnswer } from '@/types';

import { answerKeyRow, warmupVerdict } from './verdictCopy';

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
    // Roadmap D36: what did happen, plainly, then why it's no verdict. The
    // approved words of the voice pass (2026-11-23).
    expect(v?.advice).toBe('You expected about 7 and got 6. Too close to call on ten questions.');
    expect(warmupVerdict(scoreWarmup(run(70, 10, 7)))?.advice).toBe(
      "You expected about 7 and got 7. Ten questions can’t prove it, so your own predictions are the real test.",
    );
    expect(warmupVerdict(scoreWarmup(TWO))?.title).toBe('On these 2, no clear lean');
  });

  // The scale runs 0–100 (the owner, 2026-11-23): an expected count can round
  // to 0, and every answer can say 0% or 100%.
  describe('the expected count at the ends of the scale', () => {
    it('says "almost none" for a count that rounds to 0, never "about 0"', () => {
      const answers: WarmupAnswer[] = [
        ...run(0, 9, 0),
        { confidence: 5, correct: false },
      ];
      const result = scoreWarmup(answers);
      expect(result.direction).toBe('calibrated');
      const advice = warmupVerdict(result, answers)?.advice;
      expect(advice).toBe(
        "You expected almost none and got 0. Ten questions can’t prove it, so your own predictions are the real test.",
      );
      expect(advice).not.toMatch(/about 0/);
    });

    it('says "none" and "all 10" when every answer said 0% or 100%', () => {
      const none = run(0, 10, 0);
      expect(scoreWarmup(none).direction).toBe('calibrated');
      expect(warmupVerdict(scoreWarmup(none), none)?.advice).toMatch(
        /^You expected none and got 0\. /,
      );
      const all = run(100, 10, 10);
      expect(scoreWarmup(all).direction).toBe('calibrated');
      expect(warmupVerdict(scoreWarmup(all), all)?.advice).toMatch(
        /^You expected all 10 and got 10\. /,
      );
    });
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

  // Roadmap step 49: tapping straight through leaves every answer at one
  // number, and the headline says so rather than an average. The note that
  // followed ("One number for every question\u2026") was cut in the voice pass
  // (2026-11-23).
  describe('one number on every answer', () => {
    const tapThrough = (correct: number): WarmupAnswer[] =>
      Array.from({ length: 10 }, (_, i) => ({ confidence: 75, correct: i < correct }));

    it('says the shared number instead of an average, and adds no note', () => {
      const answers = tapThrough(5);
      const v = warmupVerdict(scoreWarmup(answers), answers);
      expect(v?.detail).toBe('You said 75% on all 10. 5\u00A0of\u00A010\u00A0were\u00A0right.');
      expect(v).not.toHaveProperty('sameNumber');
      expect(Object.values(v ?? {}).join(' ')).not.toMatch(/One number for every question/);
    });

    it('says an average when the numbers vary', () => {
      const varied: WarmupAnswer[] = [
        { confidence: 75, correct: true },
        { confidence: 75, correct: false },
        { confidence: 90, correct: true },
      ];
      expect(warmupVerdict(scoreWarmup(varied), varied)?.detail).toBe(
        'You said 80% on average. 2\u00A0of\u00A03\u00A0were\u00A0right.',
      );
      const allRight = tapThrough(10).map((a) => ({ ...a, confidence: 100 }));
      expect(warmupVerdict(scoreWarmup(allRight), allRight)?.detail).toBe(
        'You said 100% on all 10. 10\u00A0of\u00A010\u00A0were\u00A0right.',
      );
    });

    it('needs at least three answers to call it a pattern', () => {
      expect(warmupVerdict(scoreWarmup(TWO), TWO)?.detail).toBe(
        'You said 90% on average. 1\u00A0of\u00A02\u00A0were\u00A0right.',
      );
    });
  });

  // The voice pass (2026-11-23): the approved words for an average of 50 or
  // more, and the same voice under 50, where "when you feel sure" can't apply.
  describe('what to do next, by the lean and the side of the coin flip', () => {
    it("says the overconfident advice the way it's meant", () => {
      expect(warmupVerdict(scoreWarmup(OVERCONFIDENT))?.advice).toBe(
        'You felt surer than you were. Next time you feel sure, go a little lower.',
      );
    });

    it('reads picks against numbers when an overconfident average sat under 50', () => {
      const answers = run(40, 10, 0);
      const result = scoreWarmup(answers);
      expect(result.direction).toBe('overconfident');
      expect(warmupVerdict(result, answers)?.advice).toBe(
        'Your picks came true less often than your numbers said. Go a little lower next time.',
      );
    });

    it('says the underconfident advice for an average of 50 or more', () => {
      const answers = run(55, 10, 10);
      expect(warmupVerdict(scoreWarmup(answers), answers)?.advice).toBe(
        'You knew more than you thought. Next time you feel sure, go a little higher.',
      );
    });

    it('reads picks against numbers when an underconfident average sat under 50', () => {
      const answers = run(20, 10, 6);
      const result = scoreWarmup(answers);
      expect(result.direction).toBe('underconfident');
      expect(warmupVerdict(result, answers)?.advice).toBe(
        'Your picks came true more often than your numbers said. Go a little higher next time.',
      );
    });

    it('counts an average of exactly 50 as the sure side', () => {
      const answers = run(50, 10, 10);
      const result = scoreWarmup(answers);
      expect(result.direction).toBe('underconfident');
      expect(warmupVerdict(result, answers)?.advice).toMatch(/^You knew more than you thought\./);
    });
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
    expect(answerKeyRow(q, { confidence: 70, correct: true }).sentence).toBe('Washington, D.C.');
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
