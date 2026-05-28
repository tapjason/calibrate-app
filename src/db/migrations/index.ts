// Migrations runner. Until this file landed, src/db/client.ts ran the initial
// schema on every startup and relied on every CREATE being `IF NOT EXISTS`. Any
// real schema change (e.g. ALTER TABLE ADD COLUMN) breaks that scheme because
// repeated application throws "duplicate column" — hence this tracker.
//
// Contract:
//   • `_migrations(id TEXT PK, applied_at TEXT)` records which migrations have
//     run on this device.
//   • Each entry in `MIGRATIONS` below has a stable `id` and a SQL block.
//   • On every initDb(), the runner creates `_migrations` if missing, then
//     applies every unapplied migration in order, each wrapped in a
//     transaction so a partial failure rolls back cleanly.
//
// Adding a new migration: append it to the bottom of MIGRATIONS with a new id.
// NEVER edit or reorder existing entries — the id is the only signal a device
// has that the migration already ran.

import type { DbAdapter } from '../client';

import { MIGRATION_001 } from './001_initial';
import { MIGRATION_002 } from './002_sync_metadata';

export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { id: '001_initial', sql: MIGRATION_001 },
  { id: '002_sync_metadata', sql: MIGRATION_002 },
];

const APPLIED_AT_NOW = (): string => new Date().toISOString();

export async function runMigrations(adapter: DbAdapter): Promise<void> {
  await adapter.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       id         TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     );`,
  );

  const appliedRows = await adapter.all<{ id: string }>(
    `SELECT id FROM _migrations`,
  );
  const applied = new Set(appliedRows.map((r) => r.id));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;

    // Each migration is its own transaction so a half-applied schema can't
    // leave the device in a stuck state — either the migration AND its
    // _migrations row land, or neither does.
    await adapter.transaction(async () => {
      await adapter.exec(migration.sql);
      await adapter.run(
        `INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`,
        [migration.id, APPLIED_AT_NOW()],
      );
    });
  }
}
