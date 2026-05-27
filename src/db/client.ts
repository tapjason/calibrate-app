// The DB adapter layer. Everything in src/db/predictions.ts and src/db/stats.ts
// goes through DbAdapter, never touching expo-sqlite directly. That gives us:
//
//   • Production: a DbAdapter backed by expo-sqlite (real SQLite on iOS).
//   • Tests:      a DbAdapter backed by sql.js (real SQLite in WASM, in Node).
//
// Tests swap the backend with setDbForTests() before any helper is called;
// production code calls initDb() once at app start.
//
// Migration system caveat: 001_initial.ts is run on every startup, idempotent
// via `CREATE ... IF NOT EXISTS`. This works only because the schema doesn't
// change. The first schema change will require a real migration runner that
// tracks applied migrations in a _migrations table.

import { MIGRATION_001 } from './migrations/001_initial';

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
}

let db: DbAdapter | null = null;
let initPromise: Promise<DbAdapter> | null = null;

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
      await adapter.exec(MIGRATION_001);
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
export function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const next = txQueue.then(
    () => getDb().transaction(fn),
    () => getDb().transaction(fn),
  );
  // Swallow errors on the queue head so one failed transaction doesn't
  // poison the chain — each caller still sees its own error via `next`.
  txQueue = next.catch(() => undefined);
  return next;
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
  db = testDb;
  initPromise = null; // drop any cached init so a later initDb() rebuilds cleanly
}
