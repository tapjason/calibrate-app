import { getDb, setDbForTests } from '@/db/client';
import { listPracticeAnswers } from '@/db/practice';
import { createTestDb } from '@/db/testing';
import type { PracticeFacts } from '@/types';

import { usePracticeStore } from './practiceStore';

// Small tables with exactly one fair pair per kind used, so the assertions
// describe the store rather than whichever trivia is shipping.
const FACTS: PracticeFacts = {
  places: [
    { name: 'Rome', lat: 41.9, lon: 12.5 },
    { name: 'Madrid', lat: 40.42, lon: -3.7 },
  ],
  countries: [
    { name: 'Spain', value: 505_990 },
    { name: 'Germany', value: 357_114 },
  ],
  mountains: [],
  bodies: [],
  events: [],
  people: [
    { name: 'Charles Darwin', born: 1809 },
    { name: 'Marie Curie', born: 1867 },
  ],
  elements: [],
};

const DAY = 20_733;

function reset(): void {
  usePracticeStore.setState({ facts: FACTS, answers: [], hydrated: false });
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  reset();
});

afterEach(() => {
  setDbForTests(null);
});

describe('practiceStore', () => {
  it('asks three questions a day from the tables', () => {
    const qs = usePracticeStore.getState().questionsFor(DAY);
    expect(qs).toHaveLength(3);
    expect(new Set(qs.map((q) => q.kind)).size).toBe(3);
    expect(usePracticeStore.getState().nextSlot(DAY)).toBe(0);
  });

  it('marks an answer right or wrong, stores it, and moves to the next slot', async () => {
    const { questionsFor, answer } = usePracticeStore.getState();
    const [first, second] = questionsFor(DAY);
    await answer(DAY, 0, first!.correctIndex, 80);
    await answer(DAY, 1, second!.correctIndex === 0 ? 1 : 0, 60);

    const state = usePracticeStore.getState();
    expect(state.answersFor(DAY).map((a) => [a.slot, a.correct])).toEqual([
      [0, true],
      [1, false],
    ]);
    expect(state.nextSlot(DAY)).toBe(2);
    expect((await listPracticeAnswers()).map((a) => a.slot)).toEqual([0, 1]);
  });

  it('keeps the asked question with the answer', async () => {
    const q = usePracticeStore.getState().questionsFor(DAY)[0]!;
    await usePracticeStore.getState().answer(DAY, 0, 0, 70);
    expect(usePracticeStore.getState().answersFor(DAY)[0]?.question).toEqual(q);
  });

  it('holds confidence to 50–100', async () => {
    const { answer } = usePracticeStore.getState();
    await answer(DAY, 0, 0, 20);
    await answer(DAY, 1, 0, 140);
    await answer(DAY, 2, 0, Number.NaN);
    expect(usePracticeStore.getState().answersFor(DAY).map((a) => a.confidence)).toEqual([50, 100, 50]);
  });

  it('replaces an answer to the same slot', async () => {
    const { answer } = usePracticeStore.getState();
    await answer(DAY, 0, 0, 60);
    await answer(DAY, 0, 1, 90);
    const day = usePracticeStore.getState().answersFor(DAY);
    expect(day).toHaveLength(1);
    expect(day[0]).toMatchObject({ picked: 1, confidence: 90 });
  });

  it('says when the day is done, and what it came to', async () => {
    const { questionsFor, answer } = usePracticeStore.getState();
    const qs = questionsFor(DAY);
    for (const [slot, q] of qs.entries()) await answer(DAY, slot, q.correctIndex, 90);
    const state = usePracticeStore.getState();
    expect(state.nextSlot(DAY)).toBeNull();
    expect(state.dayTally(DAY)).toEqual({ answered: 3, correct: 3, expected: expect.closeTo(2.7, 5) });
    expect(state.nextSlot(DAY + 1)).toBe(0);
  });

  it('hydrates what was stored', async () => {
    await usePracticeStore.getState().answer(DAY, 0, 0, 70);
    reset();
    await usePracticeStore.getState().hydrate();
    expect(usePracticeStore.getState()).toMatchObject({ hydrated: true });
    expect(usePracticeStore.getState().answersFor(DAY)).toHaveLength(1);
  });

  it('never writes to the real stats', async () => {
    const { questionsFor, answer } = usePracticeStore.getState();
    for (const [slot, q] of questionsFor(DAY).entries()) await answer(DAY, slot, q.correctIndex, 90);
    // Nothing in any table that describes real predictions.
    for (const table of ['predictions', 'user_stats', 'category_stats']) {
      const row = await getDb().get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
      expect([table, row?.n]).toEqual([table, 0]);
    }
  });

  it('clears everything', async () => {
    await usePracticeStore.getState().answer(DAY, 0, 0, 70);
    await usePracticeStore.getState().clear();
    expect(usePracticeStore.getState().answers).toEqual([]);
    expect(await listPracticeAnswers()).toEqual([]);
  });

  it('reads the local day', () => {
    const day = usePracticeStore.getState().today(new Date('2026-10-07T12:00:00.000Z'));
    expect(day).toBe(Math.round(Date.UTC(2026, 9, 7) / 86_400_000));
  });
});
