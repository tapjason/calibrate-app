// Test-only DbAdapter backed by sql.js (pure-WASM SQLite running in Node).
// Production code MUST NOT import this file.
//
// Why the awkward require()s below: jest-expo's preset setup runs
//   globalThis.window = global; globalThis.window.navigator = {}
// before any test module loads. sql.js's Emscripten runtime then detects
// `window` and assumes it's in a browser, breaking WASM init. We delete
// those globals before requiring sql.js so its env detection sees Node.

import type { Database, SqlJsStatic } from 'sql.js';

import type { DbAdapter } from './client';
import { runMigrations } from './migrations';

let SQL: SqlJsStatic | null = null;

function restoreNodeEnv(): void {
  const g = globalThis as { window?: unknown; navigator?: unknown };
  if (g.window === globalThis) delete g.window;
  if (g.navigator && Object.keys(g.navigator as object).length === 0) {
    delete g.navigator;
  }
}

function adaptSqlJs(db: Database): DbAdapter {
  return {
    async run(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      stmt.run(params as never);
      stmt.free();
    },
    async get<T>(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params as never);
      const row = stmt.step() ? (stmt.getAsObject() as unknown as T) : null;
      stmt.free();
      return row;
    },
    async all<T>(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params as never);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as unknown as T);
      stmt.free();
      return rows;
    },
    async exec(sql: string) {
      db.exec(sql);
    },
    async transaction<T>(fn: () => Promise<T>) {
      db.exec('BEGIN');
      try {
        const result = await fn();
        db.exec('COMMIT');
        return result;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

/**
 * Create a fresh in-memory DB adapter with NO migrations applied. Lets a test
 * simulate a legacy device (one that pre-dates the migration runner) by exec'ing
 * the old schema by hand before running the runner. Most tests want
 * createTestDb() instead.
 */
export async function createRawTestDb(): Promise<DbAdapter> {
  restoreNodeEnv();
  if (!SQL) {
    // Use the pure asm.js build, not the WASM one — Emscripten's WASM runtime
    // misbehaves under jest-expo's patched globals. asm.js is plain JavaScript
    // and works without further env coddling. A bit slower; fine for tests.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const initSqlJs = require('sql.js/dist/sql-asm.js') as (
      config?: unknown,
    ) => Promise<SqlJsStatic>;
    SQL = await initSqlJs();
  }
  return adaptSqlJs(new SQL.Database());
}

/**
 * Create a fresh in-memory DB adapter with the migrations already applied.
 * Pass the return value to setDbForTests() in a beforeEach hook.
 */
export async function createTestDb(): Promise<DbAdapter> {
  const adapter = await createRawTestDb();
  await runMigrations(adapter);
  return adapter;
}
