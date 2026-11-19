// The connection's privacy settings (security review, 2026-11-18): deleted
// rows are overwritten with zeros (`secure_delete`, set on every open), and a
// wipe ends with a checkpoint that truncates any write-ahead log, outside any
// transaction. Neither may ever block opening the database or a wipe.

import {
  checkpointAfterWipe,
  enableSecureDelete,
  initDb,
  setDbForTests,
  withTransaction,
  type DbAdapter,
} from './client';
import { createRawTestDb, createTestDb } from './testing';

// The production adapter loads expo-sqlite lazily; here it opens a fake
// connection backed by sql.js, so initDb runs for real against SQLite.
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const openDatabaseAsync = (require('expo-sqlite') as { openDatabaseAsync: jest.Mock })
  .openDatabaseAsync;

/** The subset of expo-sqlite's connection the adapter uses, over sql.js. */
function connOver(
  backing: DbAdapter,
  calls: string[],
  failWhen: (sql: string) => boolean = () => false,
) {
  const check = (sql: string) => {
    calls.push(sql);
    if (failWhen(sql)) throw new Error(`refused: ${sql}`);
  };
  return {
    async runAsync(sql: string, params: unknown[] = []) {
      check(sql);
      await backing.run(sql, params);
      return { changes: 0, lastInsertRowId: 0 };
    },
    async getFirstAsync(sql: string, params: unknown[] = []) {
      check(sql);
      return backing.get(sql, params);
    },
    async getAllAsync(sql: string, params: unknown[] = []) {
      check(sql);
      return backing.all(sql, params);
    },
    async execAsync(sql: string) {
      check(sql);
      await backing.exec(sql);
    },
  };
}

let warn: jest.SpyInstance;
let backing: DbAdapter | null = null;

beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  openDatabaseAsync.mockReset();
});

afterEach(() => {
  setDbForTests(null);
  backing?.close?.();
  backing = null;
  warn.mockRestore();
});

describe('enableSecureDelete', () => {
  it('turns secure_delete on for the connection', async () => {
    const db = await createRawTestDb();
    backing = db;
    expect((await db.get<{ secure_delete: number }>('PRAGMA secure_delete'))?.secure_delete).toBe(0);

    await enableSecureDelete(db);

    expect((await db.get<{ secure_delete: number }>('PRAGMA secure_delete'))?.secure_delete).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('never throws when the pragma fails, and says so', async () => {
    const db = await createRawTestDb();
    backing = db;
    const failing: DbAdapter = {
      ...db,
      get: async () => {
        throw new Error('no such pragma here');
      },
    };
    await expect(enableSecureDelete(failing)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[db] could not turn on secure_delete:', expect.any(Error));
  });

  it('says so when SQLite ignores the pragma', async () => {
    const db = await createRawTestDb();
    backing = db;
    // An unknown pragma answers with no row.
    const ignoring: DbAdapter = { ...db, get: async () => null };
    await expect(enableSecureDelete(ignoring)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[db] secure_delete is not on for this connection');
  });
});

describe('initDb', () => {
  it('turns secure_delete on when it opens the connection, before the migrations', async () => {
    backing = await createRawTestDb();
    const calls: string[] = [];
    openDatabaseAsync.mockResolvedValue(connOver(backing, calls));

    const adapter = await initDb();

    expect(openDatabaseAsync).toHaveBeenCalledWith('calibrate.db');
    expect(calls[0]).toBe('PRAGMA secure_delete = ON');
    expect(calls.some((sql) => sql.includes('_migrations'))).toBe(true);
    expect((await adapter.get<{ secure_delete: number }>('PRAGMA secure_delete'))?.secure_delete).toBe(1);
  });

  it('still opens and migrates when the pragma is refused', async () => {
    backing = await createRawTestDb();
    const calls: string[] = [];
    openDatabaseAsync.mockResolvedValue(
      connOver(backing, calls, (sql) => sql.includes('secure_delete')),
    );

    const adapter = await initDb();

    // The schema is there: the migrations ran after the refused pragma.
    const applied = await adapter.all<{ id: string }>('SELECT id FROM _migrations');
    expect(applied.length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledWith('[db] could not turn on secure_delete:', expect.any(Error));
  });
});

describe('checkpointAfterWipe', () => {
  it('runs on a real SQLite without complaint', async () => {
    const db = await createTestDb();
    setDbForTests(db);
    await expect(checkpointAfterWipe()).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('waits for a queued transaction to settle, so it never runs inside one', async () => {
    const db = await createTestDb();
    const order: string[] = [];
    let inTx = false;
    const realTransaction = db.transaction.bind(db);
    const realGet = db.get.bind(db);
    db.transaction = async <T,>(fn: () => Promise<T>) =>
      realTransaction(async () => {
        inTx = true;
        try {
          return await fn();
        } finally {
          inTx = false;
        }
      });
    db.get = async <T,>(sql: string, params?: unknown[]) => {
      if (sql.includes('wal_checkpoint')) order.push(inTx ? 'checkpoint inside' : 'checkpoint outside');
      return realGet<T>(sql, params);
    };
    setDbForTests(db);

    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const tx = withTransaction(async () => {
      order.push('tx start');
      await db.run(`DELETE FROM predictions`);
      await held;
      order.push('tx end');
    });
    const checkpoint = checkpointAfterWipe();
    // Let the transaction start; the checkpoint must not have run yet.
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(['tx start']);

    release();
    await Promise.all([tx, checkpoint]);
    expect(order).toEqual(['tx start', 'tx end', 'checkpoint outside']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('never throws when the checkpoint fails, or with no database mounted', async () => {
    const db = await createTestDb();
    db.get = async () => {
      throw new Error('database table is locked');
    };
    setDbForTests(db);
    await expect(checkpointAfterWipe()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[db] the checkpoint after a wipe failed:', expect.any(Error));

    setDbForTests(null);
    await expect(checkpointAfterWipe()).resolves.toBeUndefined();
  });

  it('says so when the log was busy', async () => {
    const db = await createTestDb();
    db.get = async <T,>() => ({ busy: 1, log: 10, checkpointed: 4 }) as unknown as T;
    setDbForTests(db);
    await expect(checkpointAfterWipe()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      '[db] the checkpoint after a wipe was blocked; the next one folds the log in',
    );
  });
});
