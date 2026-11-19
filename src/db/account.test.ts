import type { Prediction } from '@/types';

import { PER_USER_TABLES, wipeLocalUserData } from './account';
import { getAgeBucket, saveAgeBucket } from './ageBucket';
import { enqueueEvent, listUnsyncedEvents } from './analytics';
import { getDb, setDbForTests } from './client';
import {
  countPostponements,
  countRefiles,
  countUnsynced,
  deletePrediction,
  insertPrediction,
  listDeletions,
  listPendingPredictions,
  noteRefile,
  recordPostponement,
  refilePrediction,
} from './predictions';
import { getUserStat, listCategoryStats, upsertCategoryStat, upsertUserStat } from './stats';
import { createTestDb } from './testing';
import { getWarmupProgress, getWarmupRecord, saveWarmupProgress, saveWarmupRecord } from './warmup';

const p = (id: string, user_id: string): Prediction => ({
  id,
  user_id,
  title: 't',
  category: 'work',
  confidence: 50,
  created_at: '2026-01-01T00:00:00.000Z',
  due_date: '2026-02-01T00:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
});

async function seedUser(userId: string): Promise<void> {
  await insertPrediction(p(`${userId}-a`, userId));
  await upsertUserStat({
    user_id: userId,
    calibration_rating: 50,
    total_predictions: 1,
    total_resolved: 0,
    current_streak: 0,
    rating_is_provisional: true,
  });
  await upsertCategoryStat({
    user_id: userId,
    category: 'work',
    predictions_made: 1,
    predictions_resolved: 0,
    calibration_score: 0,
    score_is_provisional: true,
    badge_level: 'guesser',
  });
  await enqueueEvent({
    id: `${userId}-e`,
    user_id: userId,
    name: 'prediction_logged',
    props: {},
    created_at: '2026-01-01T00:00:00.000Z',
  });
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
});

afterEach(() => {
  setDbForTests(null);
});

describe('wipeLocalUserData', () => {
  it("removes the user's predictions, stats and queued events", async () => {
    await seedUser('me');

    await saveAgeBucket({ lowerBound: 16, upperBound: 18 });
    await wipeLocalUserData('me');

    await expect(listPendingPredictions('me')).resolves.toEqual([]);
    await expect(getAgeBucket()).resolves.toBeNull();
    await expect(getUserStat('me')).resolves.toBeNull();
    await expect(listCategoryStats('me')).resolves.toEqual([]);
    await expect(listUnsyncedEvents('me', 10)).resolves.toEqual([]);
  });

  // Owner, 2026-11-09: account deletion left the Warmup on the phone.
  it('removes the Warmup and any unfinished one', async () => {
    await saveWarmupRecord({ completed_at: '2026-08-29T12:00:00.000Z', answers: [{ confidence: 70, correct: true }] });
    await saveWarmupProgress({ question_ids: ['q1'], answers: [{ confidence: 60, correct: false }] });

    await wipeLocalUserData('me');

    await expect(getWarmupRecord()).resolves.toBeNull();
    await expect(getWarmupProgress()).resolves.toBeNull();
  });

  // Sign-out keeps an account's rows on the device for when that person signs
  // back in. Deleting your account must not delete theirs.
  it("leaves another account's rows alone", async () => {
    await seedUser('me');
    await seedUser('someone-else');

    await wipeLocalUserData('me');

    await expect(listPendingPredictions('someone-else')).resolves.toHaveLength(1);
    await expect(getUserStat('someone-else')).resolves.not.toBeNull();
    await expect(listUnsyncedEvents('someone-else', 10)).resolves.toHaveLength(1);
  });

  it('rolls back entirely if any delete fails', async () => {
    await seedUser('me');
    const db = getDb();
    const realRun = db.run.bind(db);
    db.run = async (sql, params) => {
      if (sql.includes('DELETE FROM analytics_events')) throw new Error('forced failure');
      return realRun(sql, params);
    };

    await expect(wipeLocalUserData('me')).rejects.toThrow(/forced failure/);
    db.run = realRun;

    // The predictions delete ran first and was rolled back with the rest.
    await expect(listPendingPredictions('me')).resolves.toHaveLength(1);
  });

  // Step 184: the count of answers moved between categories goes too.
  it('removes the count of moved answers, and only this account’s', async () => {
    // A move is noted only once it has landed on an answered prediction.
    await moveAnswer('me-a', 'me');
    await moveAnswer('them-a', 'them');
    await wipeLocalUserData('me');
    expect(await countRefiles('me')).toBe(0);
    expect(await countRefiles('them')).toBe(1);
  });

  // Security review 2026-11-18: deleted words don't wait in a write-ahead log.
  it('ends with a checkpoint that truncates the log, after the deletes commit', async () => {
    await seedUser('me');
    const db = getDb();
    const events: string[] = [];
    let inTx = false;
    const realTransaction = db.transaction.bind(db);
    const realGet = db.get.bind(db);
    db.transaction = async <T,>(fn: () => Promise<T>) => {
      const result = await realTransaction(async () => {
        inTx = true;
        try {
          return await fn();
        } finally {
          inTx = false;
        }
      });
      events.push('committed');
      return result;
    };
    db.get = async <T,>(sql: string, params?: unknown[]) => {
      if (sql.includes('wal_checkpoint')) events.push(`${sql}${inTx ? ' (inside)' : ''}`);
      return realGet<T>(sql, params);
    };

    await wipeLocalUserData('me');

    expect(events).toEqual(['committed', 'PRAGMA wal_checkpoint(TRUNCATE)']);
    await expect(listPendingPredictions('me')).resolves.toEqual([]);
  });

  it('finishes the wipe when the checkpoint fails', async () => {
    await seedUser('me');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const db = getDb();
    const realGet = db.get.bind(db);
    db.get = async <T,>(sql: string, params?: unknown[]) => {
      if (sql.includes('wal_checkpoint')) throw new Error('database table is locked');
      return realGet<T>(sql, params);
    };

    await expect(wipeLocalUserData('me')).resolves.toBeUndefined();
    db.get = realGet;

    await expect(listPendingPredictions('me')).resolves.toEqual([]);
    await expect(getUserStat('me')).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith('[db] the checkpoint after a wipe failed:', expect.any(Error));
    warn.mockRestore();
  });

  // Owner decision 2026-11-19: sign-out removes the account's data too, so
  // the wipe must cover every table that holds rows under a user_id.
  it('empties every table that has a user_id column, and lists each one', async () => {
    const tables = await getDb().all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    );
    const withUser: string[] = [];
    for (const { name } of tables) {
      const cols = await getDb().all<{ name: string }>(`PRAGMA table_info(${name})`);
      if (cols.some((c) => c.name === 'user_id')) withUser.push(name);
    }
    expect([...PER_USER_TABLES].sort()).toEqual(withUser.sort());
  });

  it('removes every per-user row: tombstones, late changes and categories too, nothing unsynced left', async () => {
    await seedUser('me');
    await insertPrediction(p('me-late', 'me'));
    await recordPostponement('me-late', 'me', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    await deletePrediction('me-late', { counted: true });
    await getDb().run(
      `INSERT INTO categories (id, user_id, name, hidden, position, created_at)
         VALUES ('c-mine', 'me', 'Thesis', 0, 0, '2026-01-01T00:00:00.000Z')`,
    );
    expect(await countUnsynced('me')).toBeGreaterThan(0);
    expect(await countPostponements('me')).toBe(1);

    await wipeLocalUserData('me');

    for (const table of PER_USER_TABLES) {
      const row = await getDb().get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${table} WHERE user_id = 'me'`,
      );
      expect({ table, n: row?.n }).toEqual({ table, n: 0 });
    }
    expect(await countUnsynced('me')).toBe(0);
    expect(await countPostponements('me')).toBe(0);
    expect(await listDeletions('me')).toEqual([]);
  });

  it('keeps the age band and the Warmup when asked to leave device data', async () => {
    await seedUser('me');
    await saveAgeBucket({ lowerBound: 18, upperBound: null });
    await saveWarmupRecord({ completed_at: '2026-08-29T12:00:00.000Z', answers: [{ confidence: 70, correct: true }] });

    await wipeLocalUserData('me', { deviceData: false });

    await expect(listPendingPredictions('me')).resolves.toEqual([]);
    await expect(getAgeBucket()).resolves.toEqual({ lowerBound: 18, upperBound: null });
    await expect(getWarmupRecord()).resolves.not.toBeNull();
  });

  // Client review 2026-11-18, LOW 6: pages freed before secure_delete was on
  // still hold old words until the file is rebuilt.
  it('rebuilds the file once after the deletes commit, outside the transaction, before the checkpoint', async () => {
    await seedUser('me');
    const db = getDb();
    const events: string[] = [];
    let inTx = false;
    const realTransaction = db.transaction.bind(db);
    const realExec = db.exec.bind(db);
    const realGet = db.get.bind(db);
    db.transaction = async <T,>(fn: () => Promise<T>) => {
      const result = await realTransaction(async () => {
        inTx = true;
        try {
          return await fn();
        } finally {
          inTx = false;
        }
      });
      events.push('committed');
      return result;
    };
    db.exec = async (sql: string) => {
      if (sql.includes('VACUUM')) events.push(`VACUUM${inTx ? ' (inside)' : ''}`);
      return realExec(sql);
    };
    db.get = async <T,>(sql: string, params?: unknown[]) => {
      if (sql.includes('wal_checkpoint')) events.push('checkpoint');
      return realGet<T>(sql, params);
    };

    await wipeLocalUserData('me');

    expect(events).toEqual(['committed', 'VACUUM', 'checkpoint']);
  });

  it('finishes the wipe, and still checkpoints, when the rebuild fails', async () => {
    await seedUser('me');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const db = getDb();
    const realExec = db.exec.bind(db);
    const realGet = db.get.bind(db);
    const checkpoints: string[] = [];
    db.exec = async (sql: string) => {
      if (sql.includes('VACUUM')) throw new Error('database or disk is full');
      return realExec(sql);
    };
    db.get = async <T,>(sql: string, params?: unknown[]) => {
      if (sql.includes('wal_checkpoint')) checkpoints.push(sql);
      return realGet<T>(sql, params);
    };

    await expect(wipeLocalUserData('me')).resolves.toBeUndefined();
    db.exec = realExec;
    db.get = realGet;

    await expect(listPendingPredictions('me')).resolves.toEqual([]);
    expect(checkpoints).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith('[db] the vacuum after a wipe failed:', expect.any(Error));
    warn.mockRestore();
  });

  it('runs no checkpoint when the wipe rolled back', async () => {
    await seedUser('me');
    const db = getDb();
    const realRun = db.run.bind(db);
    const realGet = db.get.bind(db);
    const checkpoints: string[] = [];
    db.run = async (sql, params) => {
      if (sql.includes('DELETE FROM analytics_events')) throw new Error('forced failure');
      return realRun(sql, params);
    };
    db.get = async <T,>(sql: string, params?: unknown[]) => {
      if (sql.includes('wal_checkpoint')) checkpoints.push(sql);
      return realGet<T>(sql, params);
    };

    await expect(wipeLocalUserData('me')).rejects.toThrow(/forced failure/);
    db.run = realRun;
    db.get = realGet;
    expect(checkpoints).toEqual([]);
  });

  it('runs no rebuild when the wipe rolled back', async () => {
    await seedUser('me');
    const db = getDb();
    const realRun = db.run.bind(db);
    const realExec = db.exec.bind(db);
    const vacuums: string[] = [];
    db.run = async (sql, params) => {
      if (sql.includes('DELETE FROM analytics_events')) throw new Error('forced failure');
      return realRun(sql, params);
    };
    db.exec = async (sql: string) => {
      if (sql.includes('VACUUM')) vacuums.push(sql);
      return realExec(sql);
    };

    await expect(wipeLocalUserData('me')).rejects.toThrow(/forced failure/);
    db.run = realRun;
    db.exec = realExec;
    expect(vacuums).toEqual([]);
  });
});

/** An answered prediction moved from work to health, with the move noted (step 184). */
async function moveAnswer(id: string, userId: string): Promise<void> {
  await insertPrediction({
    ...p(id, userId),
    status: 'resolved_no',
    resolved_at: '2026-02-02T12:00:00.000Z',
  });
  await refilePrediction(id, 'health');
  await noteRefile(id, userId, 'work', 'health');
}
