import type { WarmupAnswer } from '@/types';

import { getDb, setDbForTests } from './client';
import { getUserStat, listCategoryStats } from './stats';
import { createTestDb } from './testing';
import {
  clearWarmupRecord,
  getWarmupProgress,
  getWarmupRecord,
  saveWarmupProgress,
  saveWarmupRecord,
} from './warmup';

const ANSWERS: WarmupAnswer[] = [
  { confidence: 90, correct: true },
  { confidence: 75, correct: false },
  { confidence: 50, correct: true },
];

beforeEach(async () => {
  setDbForTests(await createTestDb());
});

afterEach(() => {
  setDbForTests(null);
});

describe('warmup db', () => {
  it('returns null when no Warmup has been taken', async () => {
    expect(await getWarmupRecord()).toBeNull();
  });

  it('round-trips a completed Warmup', async () => {
    const record = {
      completed_at: '2026-08-29T12:00:00.000Z',
      answers: ANSWERS,
    };
    await saveWarmupRecord(record);
    expect(await getWarmupRecord()).toEqual(record);
  });

  // 0–100 since 2026-11-23 (the owner: "The minimum should never be 50%"):
  // the row stores whatever number was said, 0 included.
  it('keeps a confidence under 50 as said, 0 included', async () => {
    const record = {
      completed_at: '2026-11-23T12:00:00.000Z',
      answers: [
        { confidence: 0, correct: false },
        { confidence: 30, correct: true },
        { confidence: 45, correct: false },
      ],
    };
    await saveWarmupRecord(record);
    expect(await getWarmupRecord()).toEqual(record);
    await saveWarmupProgress({
      question_ids: ['q1'],
      answers: [{ confidence: 25, correct: true }],
      pick: { question_id: 'q2', option: 0, confidence: 10 },
    });
    // Saving the record cleared progress; this one is new, so it reads back.
    expect(await getWarmupProgress()).toEqual({
      question_ids: ['q1'],
      answers: [{ confidence: 25, correct: true }],
      pick: { question_id: 'q2', option: 0, confidence: 10 },
    });
  });

  it('retaking overwrites in place (stays a singleton)', async () => {
    await saveWarmupRecord({
      completed_at: '2026-08-29T12:00:00.000Z',
      answers: ANSWERS,
    });
    await saveWarmupRecord({
      completed_at: '2026-08-30T09:30:00.000Z',
      answers: [{ confidence: 60, correct: true }],
    });

    const got = await getWarmupRecord();
    expect(got?.completed_at).toBe('2026-08-30T09:30:00.000Z');
    expect(got?.answers).toEqual([{ confidence: 60, correct: true }]);

    const count = await getDb().get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM warmup_results`,
    );
    expect(count?.n).toBe(1);
  });

  it('clearWarmupRecord sends the user back to onboarding', async () => {
    await saveWarmupRecord({
      completed_at: '2026-08-29T12:00:00.000Z',
      answers: ANSWERS,
    });
    await clearWarmupRecord();
    expect(await getWarmupRecord()).toBeNull();
  });

  it('treats a corrupt row as "no Warmup taken" rather than throwing', async () => {
    await getDb().run(
      `INSERT INTO warmup_results (id, completed_at, answers_json)
       VALUES ('me', '2026-08-29T12:00:00.000Z', ?)`,
      ['{not json'],
    );
    await expect(getWarmupRecord()).resolves.toBeNull();
  });

  it('rejects a row whose answers are the wrong shape', async () => {
    await getDb().run(
      `INSERT INTO warmup_results (id, completed_at, answers_json)
       VALUES ('me', '2026-08-29T12:00:00.000Z', ?)`,
      [JSON.stringify([{ confidence: 'high', correct: 'yes' }])],
    );
    await expect(getWarmupRecord()).resolves.toBeNull();
  });

  // The CLAUDE.md guarantee: Warmup answers are not predictions and must never
  // reach real stats. Saving one leaves UserStat / CategoryStat untouched.
  it('does not leak into UserStat or CategoryStat', async () => {
    await saveWarmupRecord({
      completed_at: '2026-08-29T12:00:00.000Z',
      answers: ANSWERS,
    });

    expect(await getUserStat('user-1')).toBeNull();
    expect(await listCategoryStats('user-1')).toEqual([]);

    const predictions = await getDb().all(`SELECT * FROM predictions`);
    expect(predictions).toEqual([]);
  });

  describe('progress (playtest 2026-11-09b)', () => {
    const progress = (n: number) => ({
      question_ids: ['q1', 'q2', 'q3'].slice(0, n),
      answers: ANSWERS.slice(0, n),
    });

    it('keeps the answers so far, replacing what was kept', async () => {
      expect(await getWarmupProgress()).toBeNull();
      await saveWarmupProgress(progress(1));
      await saveWarmupProgress(progress(2));
      expect(await getWarmupProgress()).toEqual(progress(2));
    });

    it('saving none, finishing or clearing drops it', async () => {
      await saveWarmupProgress(progress(3));
      await saveWarmupProgress(progress(0));
      expect(await getWarmupProgress()).toBeNull();

      await saveWarmupProgress(progress(3));
      await saveWarmupRecord({ completed_at: '2026-08-29T12:00:00.000Z', answers: ANSWERS });
      expect(await getWarmupProgress()).toBeNull();

      await saveWarmupProgress(progress(3));
      await clearWarmupRecord();
      expect(await getWarmupProgress()).toBeNull();
    });

    // Blind playtest 2026-11-12c, finding 19.
    it("keeps the current question's pick, even before any answer", async () => {
      const pick = { question_id: 'q1', option: 1 as const, confidence: null };
      await saveWarmupProgress({ ...progress(0), pick });
      expect(await getWarmupProgress()).toEqual({ ...progress(0), pick });
      await saveWarmupProgress(progress(1));
      expect(await getWarmupProgress()).toEqual(progress(1));
    });

    it('reads a malformed pick as none', async () => {
      await saveWarmupProgress(progress(1));
      await getDb().run(`UPDATE warmup_progress SET pick_json = ?`, ['{"question_id":"q2","option":3}']);
      expect(await getWarmupProgress()).toEqual(progress(1));
      await getDb().run(`UPDATE warmup_progress SET pick_json = ?`, ['not json']);
      expect(await getWarmupProgress()).toEqual(progress(1));
    });

    it('never writes into real stats (R9)', async () => {
      await saveWarmupProgress(progress(2));
      expect(await getUserStat('user-1')).toBeNull();
      expect(await listCategoryStats('user-1')).toEqual([]);
    });

    it('reads unparseable answers as none', async () => {
      await getDb().run(
        `INSERT INTO warmup_progress (id, answers_json, question_ids, updated_at) VALUES ('me', '{nope', '[]', 'x')`,
      );
      expect(await getWarmupProgress()).toBeNull();
      await saveWarmupProgress(progress(2));
      await getDb().run(`UPDATE warmup_progress SET question_ids = '["q1"]'`);
      expect(await getWarmupProgress()).toBeNull(); // ids and answers disagree
    });
  });
});
