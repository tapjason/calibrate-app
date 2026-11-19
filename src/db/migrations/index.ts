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
import { MIGRATION_003 } from './003_provisional_flags';
import { MIGRATION_004 } from './004_entitlements';
import { MIGRATION_005 } from './005_warmup';
import { MIGRATION_006 } from './006_analytics';
import { MIGRATION_007 } from './007_practice';
import { MIGRATION_008 } from './008_prediction_deletions';
import { MIGRATION_009 } from './009_custom_categories';
import { MIGRATION_010 } from './010_age_bucket';
import { MIGRATION_011 } from './011_category_icons';
import { MIGRATION_012 } from './012_score_holes';
import { MIGRATION_013 } from './013_warmup_progress';
import { MIGRATION_014 } from './014_warmup_pick';
import { MIGRATION_015 } from './015_postponements';
import { MIGRATION_016 } from './016_warmup_result_order';
import { MIGRATION_017 } from './017_refiles';
import { MIGRATION_018 } from './018_utc_offsets';
import { MIGRATION_019 } from './019_category_origins';
import { MIGRATION_020 } from './020_sync_markers';
import { MIGRATION_021 } from './021_deletion_snapshots';
import { MIGRATION_022 } from './022_answered_categories';

export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { id: '001_initial', sql: MIGRATION_001 },
  { id: '002_sync_metadata', sql: MIGRATION_002 },
  { id: '003_provisional_flags', sql: MIGRATION_003 },
  { id: '004_entitlements', sql: MIGRATION_004 },
  { id: '005_warmup', sql: MIGRATION_005 },
  { id: '006_analytics', sql: MIGRATION_006 },
  { id: '007_practice', sql: MIGRATION_007 },
  { id: '008_prediction_deletions', sql: MIGRATION_008 },
  { id: '009_custom_categories', sql: MIGRATION_009 },
  { id: '010_age_bucket', sql: MIGRATION_010 },
  // Keeps the id it was first run under (2026-11-03); see 011_category_icons.ts.
  { id: '010_category_icons', sql: MIGRATION_011 },
  { id: '012_score_holes', sql: MIGRATION_012 },
  { id: '013_warmup_progress', sql: MIGRATION_013 },
  { id: '014_warmup_pick', sql: MIGRATION_014 },
  { id: '015_postponements', sql: MIGRATION_015 },
  { id: '016_warmup_result_order', sql: MIGRATION_016 },
  { id: '017_refiles', sql: MIGRATION_017 },
  { id: '018_utc_offsets', sql: MIGRATION_018 },
  { id: '019_category_origins', sql: MIGRATION_019 },
  { id: '020_sync_markers', sql: MIGRATION_020 },
  { id: '021_deletion_snapshots', sql: MIGRATION_021 },
  { id: '022_answered_categories', sql: MIGRATION_022 },
];

const APPLIED_AT_NOW = (): string => new Date().toISOString();

// `migrations` is injectable for tests only (e.g. to drive a deliberately
// failing migration through the runner). Production callers omit it and get
// the registered MIGRATIONS list.
export async function runMigrations(
  adapter: DbAdapter,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<void> {
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

  for (const migration of migrations) {
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
