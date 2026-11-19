// The DB adapter layer. Everything in src/db/predictions.ts and src/db/stats.ts
// goes through DbAdapter, never touching expo-sqlite directly. That gives us:
//
//   • Production: a DbAdapter backed by expo-sqlite (real SQLite on iOS).
//   • Tests:      a DbAdapter backed by sql.js (real SQLite in WASM, in Node).
//
// Tests swap the backend with setDbForTests() before any helper is called;
// production code calls initDb() once at app start.
//
// Migrations are tracked in a `_migrations` table; see ./migrations/index.ts.
// initDb() runs the registered migrations through that runner on every start.

import { runMigrations } from './migrations';

export interface DbAdapter {
  run(sql: string, params?: unknown[]): Promise<void>;
  get<T>(sql: string, params?: unknown[]): Promise<T | null>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>; // multi-statement (migrations)

  /**
   * Run `fn` inside a SQLite transaction. Every db call made through this
   * adapter inside `fn` sees uncommitted writes; on error, all writes are
   * rolled back. Used by stores (L4) to keep multi-step updates atomic
   * (e.g. resolve a prediction + recompute stats in one go).
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * Test adapters only: free the database. setDbForTests() calls it on the one
   * it replaces, so a suite's databases don't pile up in sql.js's fixed heap
   * (one more table in 2026-11 ran ResolvePrompt's suite out of memory).
   */
  close?(): void;
}

let db: DbAdapter | null = null;
let initPromise: Promise<DbAdapter> | null = null;

/**
 * Deleted words don't stay in the file (security review, 2026-11-18). By
 * default SQLite only marks deleted rows free, and their text stays in the
 * file (`Documents/SQLite/calibrate.db`), which goes into the phone's
 * backups. With `secure_delete` on, SQLite overwrites deleted content with
 * zeros. The setting belongs to the connection (neither the iOS build of
 * expo-sqlite nor the web one turns it on at compile time), so it is set on
 * every open, before anything else runs.
 *
 * Never throws: a failure is logged and the database opens anyway, since the
 * app works without it.
 */
export async function enableSecureDelete(adapter: DbAdapter): Promise<void> {
  try {
    // The pragma answers with the setting now in force. No row means a build
    // of SQLite that doesn't know it (an unknown pragma is silently ignored).
    const row = await adapter.get<{ secure_delete: number }>('PRAGMA secure_delete = ON');
    if (!row || Number(row.secure_delete) !== 1) {
      // eslint-disable-next-line no-console
      console.warn('[db] secure_delete is not on for this connection');
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[db] could not turn on secure_delete:', e);
  }
}

async function createExpoAdapter(): Promise<DbAdapter> {
  // Lazy require so Jest never tries to load the native module.
  // openDatabaseAsync (not Sync): on web, the sync API depends on
  // SharedArrayBuffer + COOP/COEP headers the Expo dev server doesn't
  // send by default, and times out. Async works on web, iOS, and Android.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
  const conn = await SQLite.openDatabaseAsync('calibrate.db');
  const adapter: DbAdapter = {
    async run(sql: string, params: unknown[] = []) {
      await conn.runAsync(sql, params as never[]);
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return (await conn.getFirstAsync(sql, params as never[])) as T | null;
    },
    async all<T>(sql: string, params: unknown[] = []) {
      return (await conn.getAllAsync(sql, params as never[])) as T[];
    },
    async exec(sql: string) {
      await conn.execAsync(sql);
    },
    async transaction<T>(fn: () => Promise<T>) {
      await conn.execAsync('BEGIN');
      try {
        const result = await fn();
        await conn.execAsync('COMMIT');
        return result;
      } catch (e) {
        await conn.execAsync('ROLLBACK');
        throw e;
      }
    },
  };
  // Per connection, so here where the connection is opened.
  await enableSecureDelete(adapter);
  return adapter;
}

/**
 * Initialize the production database. Idempotent — concurrent callers share
 * the same promise, so the adapter is built and migrated exactly once even if
 * something calls initDb() twice during a fast app start.
 */
export function initDb(): Promise<DbAdapter> {
  if (!initPromise) {
    initPromise = (async () => {
      const adapter = await createExpoAdapter();
      await runMigrations(adapter);
      db = adapter;
      return adapter;
    })();
  }
  return initPromise;
}

/** Used by every helper in src/db/. Throws if no backend has been mounted. */
export function getDb(): DbAdapter {
  if (!db) {
    throw new Error(
      'Database not initialized. Call initDb() (production) or setDbForTests() (tests).',
    );
  }
  return db;
}

/**
 * Convenience: wrap an async function in a SQLite transaction. Stores (L4)
 * call this to keep multi-step writes — e.g. resolve + recompute stats —
 * atomic without importing the adapter directly.
 *
 * Concurrent callers are serialized through a single promise chain: SQLite
 * rejects nested BEGINs on the same connection ("cannot start a transaction
 * within a transaction"), so awaiting the previous transaction before
 * starting the next is the only safe option on a single-connection adapter.
 */
let txQueue: Promise<unknown> = Promise.resolve();

/** Run `fn` after every transaction queued before it has settled. */
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = txQueue.then(
    () => fn(),
    () => fn(),
  );
  // Swallow errors on the queue head so one failed transaction doesn't
  // poison the chain — each caller still sees its own error via `next`.
  txQueue = next.catch(() => undefined);
  return next;
}

export function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  return enqueue(() => getDb().transaction(fn));
}

/**
 * Run `fn`, a read, once every transaction queued before it has settled, so
 * it sees only committed rows (review round 5). There is one connection, and a
 * read that isn't queued runs between a transaction's statements and sees
 * what that transaction has written so far, even if it then rolls back. A
 * transaction queued after this waits for `fn`. No transaction of its own,
 * and `fn`'s result or error comes back unchanged; a failure doesn't hold up
 * the queue. Never call it from inside a `withTransaction` callback, which
 * would wait on itself.
 */
export function afterQueuedTransactions<T>(fn: () => Promise<T>): Promise<T> {
  return enqueue(fn);
}

/**
 * After a wipe (Erase, account deletion; security review 2026-11-18): fold
 * the write-ahead log back into the file and truncate it to nothing, so no
 * copy of a deleted page waits there. Today the database keeps SQLite's
 * default rollback journal, which is deleted at every commit, and this is a
 * no-op; it holds if the journal mode ever becomes WAL. `secure_delete`
 * (above) is what zeroes the deleted rows in the file itself.
 *
 * SQLite refuses a checkpoint inside a transaction ("database table is
 * locked"), so it takes its turn in the transaction queue: every queued
 * transaction has settled before it runs. Never call it from inside a
 * `withTransaction` callback, which would wait on itself.
 *
 * Never throws: a failure or a busy log is logged, and the wipe still counts
 * as done.
 */
export function checkpointAfterWipe(): Promise<void> {
  return enqueue(async () => {
    try {
      const row = await getDb().get<{ busy: number }>('PRAGMA wal_checkpoint(TRUNCATE)');
      if (row && Number(row.busy) !== 0) {
        // eslint-disable-next-line no-console
        console.warn('[db] the checkpoint after a wipe was blocked; the next one folds the log in');
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[db] the checkpoint after a wipe failed:', e);
    }
  });
}

/**
 * After a wipe (sign-out's, Erase's, account deletion's; client review
 * 2026-11-18, LOW 6): rebuild the database file once with `VACUUM`. Pages
 * freed before `secure_delete` was turned on (builds before 2026-11-18) still
 * hold deleted words, and only a rebuild overwrites them: VACUUM writes the
 * live rows into a fresh copy and puts it in place of the file, which shrinks
 * to fit.
 *
 * SQLite refuses VACUUM inside a transaction, so like the checkpoint it takes
 * its turn in the transaction queue: every transaction queued before it has
 * settled before it runs, and any queued after it waits for it. Never call it
 * from inside a `withTransaction` callback, which would wait on itself.
 *
 * Never throws: a failure (no room for the copy, a statement still open) is
 * logged, and the wipe, already committed, still counts as done.
 */
export function vacuumAfterWipe(): Promise<void> {
  return enqueue(async () => {
    try {
      await getDb().exec('VACUUM');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[db] the vacuum after a wipe failed:', e);
    }
  });
}

/**
 * Test-only escape hatch — swap in a DbAdapter (e.g. sql.js-backed).
 *
 * The NODE_ENV check makes calling this from a shipped app a hard error: in a
 * production build Babel inlines process.env.NODE_ENV as the literal string
 * 'production', so any code path that reaches this function will throw at
 * runtime instead of silently mutating the database.
 */
export function setDbForTests(testDb: DbAdapter | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setDbForTests is only allowed when NODE_ENV=test');
  }
  if (db && db !== testDb) db.close?.();
  db = testDb;
  initPromise = null; // drop any cached init so a later initDb() rebuilds cleanly
}
