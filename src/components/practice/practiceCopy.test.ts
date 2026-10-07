import { PRACTICE_MIN_N, type PracticeRecord } from '@/types';

import { practiceCardCopy, practiceDayCopy, practiceRecordCopy } from './practiceCopy';

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
  it('says what is waiting', () => {
    expect(practiceCardCopy({ answered: 0, correct: 0, expected: 0 }, 3)).toEqual({
      title: 'Today’s practice',
      detail: '3 questions, about 30\u00A0seconds',
      action: 'Start',
      spoken: 'Today’s practice. 3 questions, about 30\u00A0seconds.',
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
      detail: 'You expected about\u00A02.',
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

  it('says which way it leans from the minimum', () => {
    expect(
      practiceRecordCopy(
        record({ answered: 30, days: 10, mean_confidence: 78.4, accuracy: 0.6, direction: 'overconfident' }),
      ),
    ).toEqual({
      headline: 'In practice, you run overconfident',
      detail: '30 answered over 10 days: 78% sure on average, right 60% of the time.',
    });
    expect(
      practiceRecordCopy(record({ answered: 30, days: 10, mean_confidence: 70, accuracy: 0.7, direction: 'calibrated' }))
        .headline,
    ).toBe('In practice, you’re close to calibrated');
  });

  it('never claims practice changes the real score', () => {
    const lines = [
      practiceRecordCopy(record({ answered: 5, days: 2 })),
      practiceRecordCopy(record({ answered: 40, days: 14, direction: 'underconfident', mean_confidence: 60, accuracy: 0.8 })),
    ].flatMap((c) => [c.headline, c.detail]);
    for (const line of lines) expect(line).not.toMatch(/improve|score|rating|better/i);
  });
});
