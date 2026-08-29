import type { WarmupAnswer } from '@/types';

import { getDb, setDbForTests } from './client';
import { getUserStat, listCategoryStats } from './stats';
import { createTestDb } from './testing';
import { clearWarmupRecord, getWarmupRecord, saveWarmupRecord } from './warmup';

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
});
