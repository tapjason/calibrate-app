import type { PracticeAnswer, Prediction } from '@/types';

import {
  INTEGRITY_COUNT_TABLES,
  PER_USER_TABLES,
  SIGN_OUT_KEPT_TABLES,
  wipeEverythingOnDevice,
  wipeLocalUserData,
} from './account';
import { getAgeBucket, saveAgeBucket } from './ageBucket';
import { enqueueEvent, listUnsyncedEvents } from './analytics';
import { listCategoryDefs } from './categories';
import { getDb, setDbForTests } from './client';
import { getEntitlement, upsertEntitlement } from './entitlements';
import { LOCAL_GUEST_USER_ID } from './migrateGuestData';
import { listPracticeAnswers, savePracticeAnswer } from './practice';
import {
  countPostponements,
  countRefiles,
  countUnsynced,
  deletePrediction,
  insertPrediction,
  listCategoryOrigins,
  listDeletions,
  listPendingDeletions,
  listPendingDeletionsSettled,
  listPendingPredictions,
  markDeletionPushed,
  OFFSET_BACKFILL_MARKER,
  recordPostponement,
  refilePrediction,
  rememberCategoryOrigin,
  setRefileCounted,
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

// Main session decision 2026-11-19 (client review, record audit): sign-out's
// wipe emptied the tables behind every "Only this phone keeps this count"
// line, so signing out and back in zeroed them.
describe('wipeLocalUserData with keepIntegrityCounts (sign-out)', () => {
  /**
   * One of everything Insights counts for `userId`: a counted deletion still
   * waiting to be pushed, an uncounted one already pushed, a late change, a
   * moved answer and a remembered category; plus a category of their own.
   */
  async function seedCounts(userId: string): Promise<void> {
    await seedUser(userId);
    await insertPrediction(p(`${userId}-del-waiting`, userId));
    await deletePrediction(`${userId}-del-waiting`, { counted: true });
    await insertPrediction(p(`${userId}-del-pushed`, userId));
    await deletePrediction(`${userId}-del-pushed`);
    await markDeletionPushed(`${userId}-del-pushed`);
    await insertPrediction(p(`${userId}-late`, userId));
    await recordPostponement(`${userId}-late`, userId, '2026-02-01T00:00:00.000Z', '2026-02-03T00:00:00.000Z');
    await moveAnswer(`${userId}-moved`, userId);
    await insertPrediction({ ...p(`${userId}-origin`, userId), category: 'health' });
    await rememberCategoryOrigin(`${userId}-origin`, userId, 'work', 'health', false);
    await getDb().run(
      `INSERT INTO categories (id, user_id, name, hidden, position, created_at)
         VALUES ('c-mine', ?, 'Thesis', 0, 0, '2026-01-01T00:00:00.000Z')`,
      [userId],
    );
  }

  it('names exactly the four count tables, all of them per-user', () => {
    expect([...INTEGRITY_COUNT_TABLES].sort()).toEqual([
      'prediction_category_origins',
      'prediction_deletions',
      'prediction_postponements',
      'prediction_refiles',
    ]);
    for (const table of INTEGRITY_COUNT_TABLES) expect(PER_USER_TABLES).toContain(table);
  });

  // Review round 6: the one-time offset backfill's marker stays too, so it
  // is never sent again for the account (src/db/predictions.ts).
  it('keeps the counts and the sync markers, nothing else', () => {
    expect([...SIGN_OUT_KEPT_TABLES].sort()).toEqual(
      [...INTEGRITY_COUNT_TABLES, 'sync_markers'].sort(),
    );
    for (const table of SIGN_OUT_KEPT_TABLES) expect(PER_USER_TABLES).toContain(table);
  });

  it("keeps the account's sync markers through sign-out, and Erase removes them", async () => {
    await seedCounts('me');
    await seedCounts('them');
    for (const userId of ['me', 'them']) {
      await getDb().run(
        `INSERT INTO sync_markers (user_id, marker, done_at) VALUES (?, ?, '2026-11-19T12:00:00.000Z')`,
        [userId, OFFSET_BACKFILL_MARKER],
      );
    }
    const markers = async (userId: string) =>
      (await getDb().get<{ n: number }>(`SELECT COUNT(*) AS n FROM sync_markers WHERE user_id = ?`, [userId]))?.n;

    await wipeLocalUserData('me', { deviceData: false, keepIntegrityCounts: true });
    expect(await markers('me')).toBe(1);

    await wipeLocalUserData('me');
    expect(await markers('me')).toBe(0);
    expect(await markers('them')).toBe(1);
  });

  it('keeps the counts, the counted flags and what waits to be pushed; removes the rest', async () => {
    await seedCounts('me');
    const deletionsBefore = await listDeletions('me');
    expect(deletionsBefore).toHaveLength(2);

    await wipeLocalUserData('me', { deviceData: false, keepIntegrityCounts: true });

    // The record and everything else of the account's is gone.
    await expect(listPendingPredictions('me')).resolves.toEqual([]);
    await expect(getUserStat('me')).resolves.toBeNull();
    await expect(listCategoryStats('me')).resolves.toEqual([]);
    await expect(listUnsyncedEvents('me', 10)).resolves.toEqual([]);
    await expect(listCategoryDefs('me')).resolves.toEqual([]);
    for (const table of PER_USER_TABLES) {
      if ((SIGN_OUT_KEPT_TABLES as readonly string[]).includes(table)) continue;
      const row = await getDb().get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${table} WHERE user_id = 'me'`,
      );
      expect({ table, n: row?.n }).toEqual({ table, n: 0 });
    }
    // The counts stand, the tombstones exactly as they were.
    expect(await listDeletions('me')).toEqual(deletionsBefore);
    expect((await listDeletions('me')).filter((d) => d.counted)).toHaveLength(1);
    expect(await countPostponements('me')).toBe(1);
    expect(await countRefiles('me')).toBe(1);
    expect((await listCategoryOrigins('me')).map((o) => o.prediction_id)).toEqual(['me-origin']);
    // The deletion still waiting is still waiting, for this account only.
    expect(await listPendingDeletions('me')).toEqual(['me-del-waiting']);
  });

  it("never lists a kept tombstone under the next account to sign in", async () => {
    await seedCounts('me');
    await wipeLocalUserData('me', { deviceData: false, keepIntegrityCounts: true });
    await seedUser('next');
    expect(await listPendingDeletions('next')).toEqual([]);
    expect(await listPendingDeletionsSettled('next')).toEqual([]);
    expect(await countUnsynced('next')).toBe(1); // its own seeded prediction only
    expect(await listDeletions('next')).toEqual([]);
    expect(await countRefiles('next')).toBe(0);
    expect(await countPostponements('next')).toBe(0);
  });

  it("leaves another account's counts alone either way", async () => {
    await seedCounts('me');
    await seedCounts('them');
    await wipeLocalUserData('me', { deviceData: false, keepIntegrityCounts: true });
    await wipeLocalUserData('me');
    expect(await listDeletions('them')).toHaveLength(2);
    expect(await countRefiles('them')).toBe(1);
    expect(await listCategoryOrigins('them')).toHaveLength(1);
    // Their open ones: the seeded one, the late one and the moved one.
    await expect(listPendingPredictions('them')).resolves.toHaveLength(3);
  });

  it('Erase and confirmed deletion (the default) still remove them, remembered categories too', async () => {
    await seedCounts('me');
    await wipeLocalUserData('me', { deviceData: false, keepIntegrityCounts: true });
    await wipeLocalUserData('me');
    expect(await listDeletions('me')).toEqual([]);
    expect(await countPostponements('me')).toBe(0);
    expect(await countRefiles('me')).toBe(0);
    expect(await listCategoryOrigins('me')).toEqual([]);
    expect(await countUnsynced('me')).toBe(0);
  });

  it('removes them with keepIntegrityCounts false', async () => {
    await seedCounts('me');
    await wipeLocalUserData('me', { deviceData: false, keepIntegrityCounts: false });
    expect(await listDeletions('me')).toEqual([]);
    expect(await listCategoryOrigins('me')).toEqual([]);
  });
});

// Main session decision 2026-11-19: guest Erase ("Erase all data") empties
// every per-user table for every user id, sign-out's kept tables included,
// with the device data, in one transaction.
describe('wipeEverythingOnDevice (guest Erase)', () => {
  const USERS = [LOCAL_GUEST_USER_ID, 'left-behind', 'signed-out'] as const;

  /** A row in every per-user table for `userId`. */
  async function seedEveryTable(userId: string): Promise<void> {
    await seedUser(userId);
    await insertPrediction(p(`${userId}-del`, userId));
    await deletePrediction(`${userId}-del`, { counted: true });
    await insertPrediction(p(`${userId}-late`, userId));
    await recordPostponement(`${userId}-late`, userId, '2026-02-01T00:00:00.000Z', '2026-02-03T00:00:00.000Z');
    await moveAnswer(`${userId}-moved`, userId);
    await insertPrediction({ ...p(`${userId}-origin`, userId), category: 'health' });
    await rememberCategoryOrigin(`${userId}-origin`, userId, 'work', 'health', false);
    await getDb().run(
      `INSERT INTO categories (id, user_id, name, hidden, position, created_at)
         VALUES ('c-mine', ?, 'Thesis', 0, 0, '2026-01-01T00:00:00.000Z')`,
      [userId],
    );
    await getDb().run(
      `INSERT INTO sync_markers (user_id, marker, done_at) VALUES (?, ?, '2026-11-19T12:00:00.000Z')`,
      [userId, OFFSET_BACKFILL_MARKER],
    );
  }

  const countFor = async (table: string, userId: string) =>
    (await getDb().get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, [userId]))?.n;

  /** Every table with a user_id column, read from the schema rather than the list. */
  async function tablesWithUserId(): Promise<string[]> {
    const tables = await getDb().all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    );
    const withUser: string[] = [];
    for (const { name } of tables) {
      const cols = await getDb().all<{ name: string }>(`PRAGMA table_info(${name})`);
      if (cols.some((c) => c.name === 'user_id')) withUser.push(name);
    }
    return withUser;
  }

  async function seedDeviceData(): Promise<void> {
    await saveAgeBucket({ lowerBound: null, upperBound: 12 });
    await saveWarmupRecord({ completed_at: '2026-08-29T12:00:00.000Z', answers: [{ confidence: 70, correct: true }] });
    await saveWarmupProgress({ question_ids: ['q1'], answers: [{ confidence: 60, correct: false }] });
    await savePracticeAnswer(practiceAnswer());
  }

  it('empties every per-user table for the guest and two other account ids', async () => {
    for (const userId of USERS) await seedEveryTable(userId);
    // Sign-out keeps these for an account (SIGN_OUT_KEPT_TABLES): one that
    // signed out properly leaves only them.
    await wipeLocalUserData('signed-out', { deviceData: false, keepIntegrityCounts: true });
    for (const table of PER_USER_TABLES) {
      for (const userId of USERS) {
        const kept = userId !== 'signed-out' || (SIGN_OUT_KEPT_TABLES as readonly string[]).includes(table);
        const n = (await countFor(table, userId)) ?? 0;
        expect({ table, userId, seeded: n > 0 }).toEqual({ table, userId, seeded: kept });
      }
    }

    const owners = await wipeEverythingOnDevice();

    expect([...owners].sort()).toEqual([...USERS].sort());
    // Checked against the schema, not only the list: a per-user table missing
    // from PER_USER_TABLES would keep its rows here.
    const tables = await tablesWithUserId();
    expect([...tables].sort()).toEqual([...PER_USER_TABLES].sort());
    for (const table of tables) {
      const row = await getDb().get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
      expect({ table, n: row?.n }).toEqual({ table, n: 0 });
    }
    expect(await listDeletions('signed-out')).toEqual([]);
    expect(await countRefiles('signed-out')).toBe(0);
    expect(await countPostponements('signed-out')).toBe(0);
    expect(await listCategoryOrigins('signed-out')).toEqual([]);
  });

  it('takes the device data and practice with it', async () => {
    await seedDeviceData();
    await wipeEverythingOnDevice();
    await expect(getAgeBucket()).resolves.toBeNull();
    await expect(getWarmupRecord()).resolves.toBeNull();
    await expect(getWarmupProgress()).resolves.toBeNull();
    await expect(listPracticeAnswers()).resolves.toEqual([]);
  });

  it('leaves the entitlement mirror and the migration log', async () => {
    await upsertEntitlement({ is_plus: true, source: 'annual', expires_at: '2027-01-01T00:00:00.000Z' });
    const migrations = (await getDb().get<{ n: number }>(`SELECT COUNT(*) AS n FROM _migrations`))?.n;

    await wipeEverythingOnDevice();

    await expect(getEntitlement()).resolves.toMatchObject({ is_plus: true });
    expect((await getDb().get<{ n: number }>(`SELECT COUNT(*) AS n FROM _migrations`))?.n).toBe(migrations);
  });

  it('returns no ids for an empty phone', async () => {
    await expect(wipeEverythingOnDevice()).resolves.toEqual([]);
  });

  it('leaves everything in place when a delete fails partway', async () => {
    for (const userId of USERS) await seedEveryTable(userId);
    await seedDeviceData();
    const before: Record<string, number | undefined> = {};
    for (const table of PER_USER_TABLES) {
      before[table] = (await getDb().get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n;
    }
    const db = getDb();
    const realRun = db.run.bind(db);
    const realExec = db.exec.bind(db);
    const realGet = db.get.bind(db);
    const after: string[] = [];
    // Late in the list: earlier tables have been emptied when it throws.
    db.run = async (sql, params) => {
      if (sql.includes('DELETE FROM categories')) throw new Error('forced failure');
      return realRun(sql, params);
    };
    db.exec = async (sql: string) => {
      if (sql.includes('VACUUM')) after.push('vacuum');
      return realExec(sql);
    };
    db.get = async <T,>(sql: string, params?: unknown[]) => {
      if (sql.includes('wal_checkpoint')) after.push('checkpoint');
      return realGet<T>(sql, params);
    };

    await expect(wipeEverythingOnDevice()).rejects.toThrow(/forced failure/);
    db.run = realRun;
    db.exec = realExec;
    db.get = realGet;

    for (const table of PER_USER_TABLES) {
      const row = await getDb().get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
      expect({ table, n: row?.n }).toEqual({ table, n: before[table] });
    }
    await expect(getAgeBucket()).resolves.toEqual({ lowerBound: null, upperBound: 12 });
    await expect(getWarmupRecord()).resolves.not.toBeNull();
    await expect(listPracticeAnswers()).resolves.toHaveLength(1);
    expect(after).toEqual([]);
  });

  it('rebuilds the file and truncates the log after the deletes commit, outside the transaction', async () => {
    await seedEveryTable('left-behind');
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
      if (sql.includes('wal_checkpoint')) events.push(`checkpoint${inTx ? ' (inside)' : ''}`);
      return realGet<T>(sql, params);
    };

    await wipeEverythingOnDevice();

    expect(events).toEqual(['committed', 'VACUUM', 'checkpoint']);
  });
});

/** One practice answer, as the practice tests write it. */
function practiceAnswer(): PracticeAnswer {
  return {
    day: 20_734,
    slot: 0,
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
    answered_at: '2026-10-08T12:00:00.000Z',
  };
}

/** An answered prediction moved from work to health, with the move noted (step 184). */
async function moveAnswer(id: string, userId: string): Promise<void> {
  await insertPrediction({
    ...p(id, userId),
    status: 'resolved_no',
    resolved_at: '2026-02-02T12:00:00.000Z',
  });
  await refilePrediction(id, 'health');
  await setRefileCounted(id, userId, true, 'work', 'health');
}
