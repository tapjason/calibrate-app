import { scorePractice } from '@/engine/practice';
import { PRACTICE_MIN_N, type PracticeAnswer, type PracticeRecord } from '@/types';

import { PRACTICE_APART, practiceCardCopy, practiceDayCopy, practiceRecordCopy } from './practiceCopy';

/** One practice answer, as the engine's tests build it. */
const answer = (confidence: number, correct: boolean, day = 20_000): PracticeAnswer => ({
  day,
  slot: 0,
  question: {
    id: 'north:a|b',
    kind: 'north',
    prompt: 'Which is farther north?',
    options: ['a', 'b'],
    correctIndex: 0,
    fact: 'A is north of B.',
  },
  picked: correct ? 0 : 1,
  correct,
  confidence,
  answered_at: '2026-10-07T12:00:00.000Z',
});

const record = (over: Partial<PracticeRecord>): PracticeRecord => ({
  answered: 0,
  correct: 0,
  days: 0,
  mean_confidence: 0,
  accuracy: 0,
  direction: null,
  buckets: [],
  ...over,
});

describe('practiceCardCopy (roadmap step 88)', () => {
  // The voice pass's words (2026-11-23).
  it('says what is waiting', () => {
    expect(practiceCardCopy({ answered: 0, correct: 0, expected: 0 }, 3)).toEqual({
      title: 'Today’s practice',
      detail: '3 quick questions. About 30\u00A0seconds',
      action: 'Start',
      spoken: 'Today’s practice. 3 quick questions. About 30\u00A0seconds.',
      done: false,
    });
  });

  it('says how far it got', () => {
    expect(practiceCardCopy({ answered: 1, correct: 1, expected: 0.8 }, 3)).toMatchObject({
      detail: '1 of 3 answered',
      action: 'Continue',
      done: false,
    });
  });

  it('says what it came to once done, and when the next ones come', () => {
    expect(practiceCardCopy({ answered: 3, correct: 2, expected: 2.4 }, 3)).toMatchObject({
      title: 'Practice done',
      detail: '2 of 3 right. New ones tomorrow',
      action: 'See answers',
      done: true,
    });
  });
});

describe('practiceDayCopy', () => {
  it('counts the day against what was expected', () => {
    expect(practiceDayCopy({ answered: 3, correct: 2, expected: 2.4 })).toEqual({
      title: '2 of 3 right',
      detail: 'You expected 2\u00A0or\u00A03.',
    });
    expect(practiceDayCopy({ answered: 3, correct: 0, expected: 0.4 }).detail).toBe(
      'You expected less than\u00A01.',
    );
  });
});

describe('practiceRecordCopy', () => {
  it('gives counts and the way to go below the minimum', () => {
    expect(practiceRecordCopy(record({ answered: 12, days: 4 }))).toEqual({
      headline: '12 answered over 4 days.',
      detail: `${PRACTICE_MIN_N - 12} more and this shows which way you lean.`,
    });
    expect(practiceRecordCopy(record({ answered: 3, days: 1 })).headline).toBe('3 answered over 1 day.');
  });

  it('says which way it leans from the minimum, at the range the rule names', () => {
    // 20 at 90%, 12 right, over 10 days: one range, too sure.
    const answers = Array.from({ length: 20 }, (_, i) => answer(90, i < 12, 20_000 + (i % 10)));
    expect(practiceRecordCopy(scorePractice(answers))).toEqual({
      headline: 'In practice, you run overconfident at 80–100%',
      detail: '20 answered over 10 days: 90% sure on average, right 60% of the time.',
    });
  });

  // Record audit 2026-11-23: the headline read the pooled answers while the
  // chart under it marks each range by the lean rule. It now words the
  // chart's own read (chartRead), over ranges with 10 answers or more.
  describe('by the chart title rule', () => {
    it('names both sides when the pooled answers cancel out (the mirror case)', () => {
      // Ten at 10% all right, ten at 90% all wrong: 50% said, 50% right
      // pooled, which read "close to calibrated". Both sides in Insights'
      // words (code review 2026-11-23, round 2).
      const answers = [
        ...Array.from({ length: 10 }, () => answer(10, true)),
        ...Array.from({ length: 10 }, () => answer(90, false)),
      ];
      const r = scorePractice(answers);
      expect(r.direction).toBe('calibrated'); // the pooled read the headline doesn't use here
      expect(practiceRecordCopy(r)).toEqual({
        headline: 'In practice, you’re too sure at 80–100% and too cautious at 0–20%',
        detail: '20 answered over 1 day: 50% sure on average, right 50% of the time.',
      });
    });

    it('never says close to calibrated over 70% sure, right 55%', () => {
      const r = scorePractice(Array.from({ length: 20 }, (_, i) => answer(70, i < 11)));
      const { headline, detail } = practiceRecordCopy(r);
      expect(detail).toBe('20 answered over 1 day: 70% sure on average, right 55% of the time.');
      expect(headline).not.toMatch(/calibrated/);
      // Whatever the engine's lean rule calls the 60–80% range, the headline
      // says the same thing.
      const range = r.buckets.find((b) => b.low === 60)!;
      expect(headline).toBe(
        range.direction === 'calibrated'
          ? 'In practice, no clear lean yet'
          : `In practice, you run ${range.direction} at 60–80%`,
      );
    });

    // Code review 2026-11-23, round 2: the ranges with 10 answers can sit on
    // the line while a smaller one pulls the pooled answers well off it. The
    // headline then can't say "close to calibrated" over the pooled line.
    it('never says close to calibrated while the pooled answers are off (case A)', () => {
      // 10 at 50% with 5 right, 10 at 70% with 7 right, 9 at 95% with 4 right.
      const answers = [
        ...Array.from({ length: 10 }, (_, i) => answer(50, i < 5)),
        ...Array.from({ length: 10 }, (_, i) => answer(70, i < 7)),
        ...Array.from({ length: 9 }, (_, i) => answer(95, i < 4)),
      ];
      const r = scorePractice(answers);
      const { headline, detail } = practiceRecordCopy(r);
      expect(detail).toBe('29 answered over 1 day: 71% sure on average, right 55% of the time.');
      expect(headline).not.toMatch(/calibrated/);
      // The two ranges with 10 lean by nothing, so no lean is named.
      expect(headline).toBe('In practice, no clear lean yet');
    });

    it('reads the pooled lean while no range has 10 answers (case B)', () => {
      // 7 at 95% with 2 right, 7 at 70% with 4, 6 at 50% with 3.
      const answers = [
        ...Array.from({ length: 7 }, (_, i) => answer(95, i < 2)),
        ...Array.from({ length: 7 }, (_, i) => answer(70, i < 4)),
        ...Array.from({ length: 6 }, (_, i) => answer(50, i < 3)),
      ];
      const r = scorePractice(answers);
      expect(r.buckets.every((b) => b.total_resolved < 10)).toBe(true);
      // Whatever the engine's lean rule calls the pooled answers.
      expect(practiceRecordCopy(r).headline).toBe(
        r.direction === 'calibrated' || r.direction === null
          ? 'In practice, no clear lean yet'
          : `In practice, you run ${r.direction}`,
      );
    });

    it('says close to calibrated when every range is within 5 points', () => {
      // 20 at 70% with 14 right, and 10 at 30% with 3 right.
      const answers = [
        ...Array.from({ length: 20 }, (_, i) => answer(70, i < 14)),
        ...Array.from({ length: 10 }, (_, i) => answer(30, i < 3)),
      ];
      expect(practiceRecordCopy(scorePractice(answers)).headline).toBe(
        'In practice, you’re close to calibrated',
      );
      // One range only: it is named.
      expect(
        practiceRecordCopy(scorePractice(Array.from({ length: 20 }, (_, i) => answer(70, i < 14)))).headline,
      ).toBe('In practice, you’re close to calibrated at 60–80%');
    });

    it('names a single leaning range beside one inside luck', () => {
      // 20 at 30% with 12 right (luck gives 3 to 9): too cautious there; 10
      // at 70% with 7 right: on the line.
      const answers = [
        ...Array.from({ length: 20 }, (_, i) => answer(30, i < 12)),
        ...Array.from({ length: 10 }, (_, i) => answer(70, i < 7)),
      ];
      expect(practiceRecordCopy(scorePractice(answers)).headline).toBe(
        'In practice, you run underconfident at 20–40%',
      );
    });

    it('names no range while no range has 10 answers', () => {
      // 20 answers over four ranges, five each.
      const answers = [10, 30, 50, 70].flatMap((c) =>
        Array.from({ length: 5 }, (_, i) => answer(c, i < 1)),
      );
      const r = scorePractice(answers);
      expect(r.buckets.every((b) => b.total_resolved < 10)).toBe(true);
      const { headline } = practiceRecordCopy(r);
      expect(headline).not.toMatch(/%/);
      expect(headline).toBe(
        r.direction === 'calibrated' || r.direction === null
          ? 'In practice, no clear lean yet'
          : `In practice, you run ${r.direction}`,
      );
    });

    it('names no lean when the pooled answers are on the line and no range has 10', () => {
      // Five each at 10, 30, 50 and 70%, coming true as often as said
      // (rounded): pooled 40% said, 40% right.
      const answers = [
        ...Array.from({ length: 5 }, () => answer(10, false)),
        ...Array.from({ length: 5 }, (_, i) => answer(30, i < 2)),
        ...Array.from({ length: 5 }, (_, i) => answer(50, i < 2)),
        ...Array.from({ length: 5 }, (_, i) => answer(70, i < 4)),
      ];
      const r = scorePractice(answers);
      expect(r.direction).toBe('calibrated');
      expect(practiceRecordCopy(r).headline).toBe('In practice, no clear lean yet');
    });

    it('says the pooled lean when no range has 10 and the engine names one', () => {
      // A record built by hand: no range at 10, the pooled read too sure.
      expect(
        practiceRecordCopy(
          record({ answered: 20, days: 5, direction: 'overconfident', mean_confidence: 85, accuracy: 0.5 }),
        ).headline,
      ).toBe('In practice, you run overconfident');
      expect(
        practiceRecordCopy(
          record({ answered: 20, days: 5, direction: 'underconfident', mean_confidence: 55, accuracy: 0.85 }),
        ).headline,
      ).toBe('In practice, you run underconfident');
    });
  });

  it('never claims practice changes the real score', () => {
    const lines = [
      practiceRecordCopy(record({ answered: 5, days: 2 })),
      practiceRecordCopy(record({ answered: 40, days: 14, direction: 'underconfident', mean_confidence: 60, accuracy: 0.8 })),
    ].flatMap((c) => [c.headline, c.detail]);
    for (const line of lines) expect(line).not.toMatch(/improve|score|rating|better/i);
  });
});

describe('practiceCardCopy before the first answer (D62)', () => {
  // The title says "While you wait"; the detail is the usual one since the
  // voice pass (2026-11-23).
  it('says "While you wait" while the first prediction waits', () => {
    expect(practiceCardCopy({ answered: 0, correct: 0, expected: 0 }, 3, true)).toEqual({
      title: 'While you wait: today’s practice',
      detail: '3 quick questions. About 30\u00A0seconds',
      action: 'Start',
      spoken: 'While you wait: today’s practice. 3 quick questions. About 30\u00A0seconds.',
      done: false,
    });
    // Started: the usual words.
    expect(practiceCardCopy({ answered: 1, correct: 1, expected: 0.8 }, 3, true).title).toBe(
      'Today’s practice',
    );
  });
});

describe('PRACTICE_APART', () => {
  // The voice pass's words (2026-11-23): practice touches nothing real.
  it('keeps practice in its place', () => {
    expect(PRACTICE_APART).toBe(
      'Practice is just practice. It doesn’t touch your rating, badges or streak.',
    );
  });
});
