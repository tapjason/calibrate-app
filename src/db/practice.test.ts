import type { PracticeAnswer } from '@/types';

import { getDb, setDbForTests } from './client';
import { clearPracticeAnswers, listPracticeAnswers, savePracticeAnswer } from './practice';
import { createTestDb } from './testing';

const answer = (day: number, slot: number, over: Partial<PracticeAnswer> = {}): PracticeAnswer => ({
  day,
  slot,
  question: {
    id: 'north:Rome|New York',
    kind: 'north',
    prompt: 'Which is farther north?',
    options: ['Rome', 'New York'],
    correctIndex: 0,
    fact: 'Rome is about 1° farther north than New York (41.9°N against 40.7°N).',
  },
  picked: 0,
  correct: true,
  confidence: 70,
  answered_at: '2026-10-07T12:00:00.000Z',
  ...over,
});

beforeEach(async () => {
  setDbForTests(await createTestDb());
});

afterEach(() => {
  setDbForTests(null);
});

describe('practice db', () => {
  it('starts empty', async () => {
    expect(await listPracticeAnswers()).toEqual([]);
  });

  it('round-trips answers, question included, oldest first', async () => {
    await savePracticeAnswer(answer(20_734, 1, { picked: 1, correct: false, confidence: 55 }));
    await savePracticeAnswer(answer(20_733, 0));
    await savePracticeAnswer(answer(20_734, 0));
    const all = await listPracticeAnswers();
    expect(all.map((a) => [a.day, a.slot])).toEqual([
      [20_733, 0],
      [20_734, 0],
      [20_734, 1],
    ]);
    expect(all[2]).toEqual(answer(20_734, 1, { picked: 1, correct: false, confidence: 55 }));
  });

  it('replaces an answer to the same day and slot', async () => {
    await savePracticeAnswer(answer(20_733, 0, { confidence: 60 }));
    await savePracticeAnswer(answer(20_733, 0, { confidence: 90 }));
    const all = await listPracticeAnswers();
    expect(all).toHaveLength(1);
    expect(all[0]?.confidence).toBe(90);
  });

  it('skips a row it cannot read rather than failing the rest', async () => {
    await savePracticeAnswer(answer(20_733, 0));
    await getDb().run(
      `INSERT INTO practice_answers (id, day, slot, question_json, picked, correct, confidence, answered_at)
       VALUES ('20734:0', 20734, 0, 'not json', 0, 1, 70, '2026-10-08T12:00:00.000Z')`,
    );
    await getDb().run(
      `INSERT INTO practice_answers (id, day, slot, question_json, picked, correct, confidence, answered_at)
       VALUES ('20734:1', 20734, 1, '{"id":"x","kind":"weather","prompt":"?","options":["a","b"],"correctIndex":0,"fact":"f"}', 0, 1, 70, '2026-10-08T12:00:00.000Z')`,
    );
    const all = await listPracticeAnswers();
    expect(all.map((a) => a.day)).toEqual([20_733]);
  });

  it('clears everything', async () => {
    await savePracticeAnswer(answer(20_733, 0));
    await savePracticeAnswer(answer(20_733, 1));
    await clearPracticeAnswers();
    expect(await listPracticeAnswers()).toEqual([]);
  });
});
