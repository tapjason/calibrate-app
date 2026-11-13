import { setDbForTests } from '@/db/client';
import { listCategoryStats, getUserStat } from '@/db/stats';
import { createTestDb } from '@/db/testing';
import { PRACTICE_FACTS } from '@/constants/practiceFacts';
import { getWarmupProgress, getWarmupRecord, saveWarmupProgress, saveWarmupRecord } from '@/db/warmup';
import { warmupQuestions } from '@/engine/practice';
import type { WarmupQuestion } from '@/types';

import {
  selectCurrentQuestion,
  selectHasCompletedWarmup,
  useWarmupStore,
} from './warmupStore';

// A tiny deterministic bank, so the assertions describe the store's behavior
// rather than whichever trivia happens to be shipping.
const QUESTIONS: readonly WarmupQuestion[] = [
  {
    id: 'q1',
    prompt: 'First?',
    options: ['a', 'b'],
    correctIndex: 0,
    fact: 'because a',
  },
  {
    id: 'q2',
    prompt: 'Second?',
    options: ['a', 'b'],
    correctIndex: 1,
    fact: 'because b',
  },
];

function reset(): void {
  useWarmupStore.setState({
    questions: QUESTIONS,
    index: 0,
    answers: [],
    result: null,
    completedAt: null,
    hydrated: false,
    pick: null,
  });
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  reset();
});

afterEach(() => {
  setDbForTests(null);
});

describe('warmupStore', () => {
  it('starts with no progress and no verdict', () => {
    const s = useWarmupStore.getState();
    expect(s.index).toBe(0);
    expect(s.result).toBeNull();
    expect(selectHasCompletedWarmup(s)).toBe(false);
    expect(selectCurrentQuestion(s)?.id).toBe('q1');
  });

  it('hydrates to "not taken" when nothing is stored', async () => {
    await useWarmupStore.getState().hydrate();
    const s = useWarmupStore.getState();
    expect(s.hydrated).toBe(true);
    expect(selectHasCompletedWarmup(s)).toBe(false);
  });

  it('advances through questions and marks each answer right or wrong', async () => {
    await useWarmupStore.getState().answer(0, 80); // q1 correct
    expect(useWarmupStore.getState().index).toBe(1);
    expect(selectCurrentQuestion(useWarmupStore.getState())?.id).toBe('q2');

    await useWarmupStore.getState().answer(0, 70); // q2 wrong

    expect(useWarmupStore.getState().answers).toEqual([
      { confidence: 80, correct: true },
      { confidence: 70, correct: false },
    ]);
  });

  it('scores and persists on the final answer', async () => {
    await useWarmupStore.getState().answer(0, 90);
    await useWarmupStore.getState().answer(1, 90);

    const s = useWarmupStore.getState();
    expect(selectHasCompletedWarmup(s)).toBe(true);
    expect(s.result?.answered).toBe(2);
    expect(s.result?.accuracy).toBe(1);
    expect(selectCurrentQuestion(s)).toBeNull();

    const stored = await getWarmupRecord();
    expect(stored?.answers).toEqual([
      { confidence: 90, correct: true },
      { confidence: 90, correct: true },
    ]);
    expect(stored?.completed_at).toBe(s.completedAt);
  });

  it('re-derives the verdict from stored answers on hydrate', async () => {
    await useWarmupStore.getState().answer(0, 95); // correct
    await useWarmupStore.getState().answer(0, 95); // wrong
    const completedAt = useWarmupStore.getState().completedAt;

    reset();
    await useWarmupStore.getState().hydrate();

    const s = useWarmupStore.getState();
    expect(s.completedAt).toBe(completedAt);
    expect(s.answers).toHaveLength(2);
    // 95% stated, 50% right — the overconfidence the Warmup exists to surface.
    expect(s.result?.direction).toBe('overconfident');
    expect(selectHasCompletedWarmup(s)).toBe(true);
  });

  it('clamps confidence into the 50–100 slider range', async () => {
    await useWarmupStore.getState().answer(0, 12);
    await useWarmupStore.getState().answer(0, 140);

    expect(useWarmupStore.getState().answers.map((a) => a.confidence)).toEqual([
      50, 100,
    ]);
  });

  it('ignores answers once the quiz is finished', async () => {
    await useWarmupStore.getState().answer(0, 80);
    await useWarmupStore.getState().answer(1, 80);
    const before = useWarmupStore.getState().answers.length;

    await useWarmupStore.getState().answer(0, 80);

    expect(useWarmupStore.getState().answers).toHaveLength(before);
  });

  // Blind playtest 2026-11-09b, finding 1: a reload at question 5 started over.
  it('reopens an unfinished quiz at the next question after a reload', async () => {
    await useWarmupStore.getState().answer(0, 80);
    reset(); // the app reloads: memory is gone
    await useWarmupStore.getState().hydrate();

    const s = useWarmupStore.getState();
    expect(s.index).toBe(1);
    expect(s.answers).toEqual([{ confidence: 80, correct: true }]);
    expect(selectCurrentQuestion(s)?.id).toBe('q2');
    expect(selectHasCompletedWarmup(s)).toBe(false);

    await useWarmupStore.getState().answer(1, 60);
    expect(useWarmupStore.getState().result?.answered).toBe(2);
    expect(await getWarmupProgress()).toBeNull();
  });

  // Blind playtest 2026-11-12c, finding 19: the earlier answers were kept, the
  // current question's pick and number weren't.
  it("keeps the current question's pick and number across a reload", async () => {
    await useWarmupStore.getState().setPick(1, null);
    await useWarmupStore.getState().setPick(1, 75);
    reset();
    await useWarmupStore.getState().hydrate();
    expect(useWarmupStore.getState().index).toBe(0);
    expect(useWarmupStore.getState().pick).toEqual({ option: 1, confidence: 75 });

    await useWarmupStore.getState().answer(1, 75);
    expect(useWarmupStore.getState().pick).toBeNull();
    reset();
    await useWarmupStore.getState().hydrate();
    expect(useWarmupStore.getState().index).toBe(1);
    expect(useWarmupStore.getState().pick).toBeNull();

    await useWarmupStore.getState().setPick(0, null);
    reset();
    await useWarmupStore.getState().hydrate();
    expect(useWarmupStore.getState().pick).toEqual({ option: 0, confidence: null });
  });

  it("drops a kept pick that was for another question, or that's cleared", async () => {
    await saveWarmupProgress({
      question_ids: [],
      answers: [],
      pick: { question_id: 'q2', option: 0, confidence: 60 },
    });
    await useWarmupStore.getState().hydrate();
    expect(useWarmupStore.getState().pick).toBeNull();

    reset();
    await useWarmupStore.getState().setPick(0, 70);
    await useWarmupStore.getState().setPick(null, null);
    expect(await getWarmupProgress()).toBeNull();
  });

  it('starts over when the kept answers are not a prefix of these questions', async () => {
    // As many as the quiz has: nothing left to ask.
    await saveWarmupProgress({
      question_ids: ['q1', 'q2'],
      answers: [
        { confidence: 80, correct: true },
        { confidence: 80, correct: true },
      ],
    });
    await useWarmupStore.getState().hydrate();
    expect(useWarmupStore.getState().index).toBe(0);

    // Answered against another question (an update changed the ten).
    reset();
    await saveWarmupProgress({ question_ids: ['old-q'], answers: [{ confidence: 80, correct: true }] });
    await useWarmupStore.getState().hydrate();
    expect(useWarmupStore.getState().index).toBe(0);
  });

  it('restart clears progress but keeps the stored record', async () => {
    await useWarmupStore.getState().answer(0, 80);
    await useWarmupStore.getState().answer(1, 80);

    useWarmupStore.getState().restart();

    expect(useWarmupStore.getState().index).toBe(0);
    expect(useWarmupStore.getState().result).toBeNull();
    expect(await getWarmupRecord()).not.toBeNull();
  });

  it('restart drops the answers kept so far', async () => {
    await useWarmupStore.getState().answer(0, 80);
    useWarmupStore.getState().restart();
    await new Promise((r) => setTimeout(r, 0));
    expect(await getWarmupProgress()).toBeNull();
  });

  it('retake wipes the stored record and resets', async () => {
    await useWarmupStore.getState().answer(0, 80);
    await useWarmupStore.getState().answer(1, 80);

    await useWarmupStore.getState().retake();

    const s = useWarmupStore.getState();
    expect(selectHasCompletedWarmup(s)).toBe(false);
    expect(s.answers).toEqual([]);
    expect(await getWarmupRecord()).toBeNull();
  });

  it('keeps the verdict on screen when persistence fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setDbForTests(null); // any db call now throws

    await useWarmupStore.getState().answer(0, 80);
    await useWarmupStore.getState().answer(1, 80);

    expect(useWarmupStore.getState().result?.answered).toBe(2);
    expect(selectHasCompletedWarmup(useWarmupStore.getState())).toBe(true);
    warn.mockRestore();
  });

  // CLAUDE.md: Warmup results are stored separately and never mixed into real
  // UserStat / CategoryStat data.
  it('never writes Warmup data into real stats', async () => {
    await useWarmupStore.getState().answer(0, 80);
    await useWarmupStore.getState().answer(1, 80);

    expect(await getUserStat('user-1')).toBeNull();
    expect(await listCategoryStats('user-1')).toEqual([]);
  });
});

// Step 173 (record audit and code review 2026-11-12): finished Warm-ups store
// answers by position, so the ten are read back in the order they were asked.
describe('warmupStore — a finished Warm-up keeps its questions’ order', () => {
  const answers = Array.from({ length: 10 }, (_, i) => ({ confidence: 70, correct: i % 2 === 0 }));

  it('reads a result saved before the reorder in the old order', async () => {
    await saveWarmupRecord({ completed_at: '2026-11-01T10:00:00.000Z', answers });
    await useWarmupStore.getState().hydrate();
    expect(useWarmupStore.getState().questions.map((q) => q.id)).toEqual(
      warmupQuestions(PRACTICE_FACTS, false).map((q) => q.id),
    );
  });

  it('reads one saved with its ids in that order, and saves the ids it was asked in', async () => {
    const ids = warmupQuestions(PRACTICE_FACTS).map((q) => q.id).reverse();
    await saveWarmupRecord({ completed_at: '2026-11-12T10:00:00.000Z', answers, question_ids: ids });
    await useWarmupStore.getState().hydrate();
    expect(useWarmupStore.getState().questions.map((q) => q.id)).toEqual(ids);

    // Finishing stores the order asked.
    useWarmupStore.setState({ questions: QUESTIONS, index: 0, answers: [], result: null, completedAt: null });
    await useWarmupStore.getState().answer(0, 70);
    await useWarmupStore.getState().answer(1, 80);
    expect((await getWarmupRecord())?.question_ids).toEqual(['q1', 'q2']);
  });
});
