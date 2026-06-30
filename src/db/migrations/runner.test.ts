// Migrations runner tests. The runner is the foundation for every other
// schema change — if it accidentally re-applies a migration, ALTER TABLE
// throws "duplicate column" and the app fails to launch.

import { getDb, setDbForTests } from '../client';
import { createRawTestDb, createTestDb } from '../testing';

import { MIGRATION_001 } from './001_initial';
import { MIGRATIONS, runMigrations, type Migration } from './index';

beforeEach(async () => {
  setDbForTests(await createTestDb());
});

afterEach(() => {
  setDbForTests(null);
});

describe('migrations runner', () => {
  it('records every registered migration in _migrations', async () => {
    const rows = await getDb().all<{ id: string }>(
      `SELECT id FROM _migrations ORDER BY id`,
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual(MIGRATIONS.map((m) => m.id));
  });

  it('applies the predictions schema from 001', async () => {
    // Sanity: the table exists and has the post-001 columns.
    const cols = await getDb().all<{ name: string }>(
      `PRAGMA table_info(predictions)`,
    );
    const names = new Set(cols.map((c) => c.name));
    expect(names.has('id')).toBe(true);
    expect(names.has('status')).toBe(true);
    expect(names.has('confidence')).toBe(true);
  });

  it('applies the sync metadata columns from 002', async () => {
    const cols = await getDb().all<{ name: string }>(
      `PRAGMA table_info(predictions)`,
    );
    const names = new Set(cols.map((c) => c.name));
    expect(names.has('updated_at')).toBe(true);
    expect(names.has('dirty')).toBe(true);
  });

  it('is a no-op when every migration is already applied', async () => {
    // createTestDb already ran the migrations; calling again should not
    // throw "duplicate column" or insert duplicate _migrations rows.
    await expect(runMigrations(getDb())).resolves.toBeUndefined();

    const rows = await getDb().all<{ id: string }>(`SELECT id FROM _migrations`);
    // Each id appears exactly once.
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
    for (const m of MIGRATIONS) {
      expect(counts.get(m.id)).toBe(1);
    }
  });

  it('does not record a migration whose SQL throws, and applies the ones before it', async () => {
    // Drive a doctored list through the actual runner: a good migration, then a
    // broken one, then a migration that should never run because the broken one
    // aborts the loop.
    const raw = await createRawTestDb();
    const list: Migration[] = [
      { id: 'mig_ok', sql: `CREATE TABLE mig_ok (x INTEGER);` },
      { id: 'mig_bad', sql: `THIS IS NOT VALID SQL;` },
      { id: 'mig_never', sql: `CREATE TABLE mig_never (x INTEGER);` },
    ];

    await expect(runMigrations(raw, list)).rejects.toThrow();

    const applied = new Set(
      (await raw.all<{ id: string }>(`SELECT id FROM _migrations`)).map(
        (r) => r.id,
      ),
    );
    // The good one before the failure committed (id + its table)...
    expect(applied.has('mig_ok')).toBe(true);
    const okTable = await raw.all(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mig_ok'`,
    );
    expect(okTable).toHaveLength(1);
    // ...the broken one rolled back (no id, no half-applied effect)...
    expect(applied.has('mig_bad')).toBe(false);
    // ...and the one after it never ran.
    expect(applied.has('mig_never')).toBe(false);
    const neverTable = await raw.all(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mig_never'`,
    );
    expect(neverTable).toHaveLength(0);
  });

  it('resumes after a fixed migration without re-running committed ones', async () => {
    // Same scenario as above, then the bad migration is "fixed" on the next
    // launch. The runner should skip mig_ok (already recorded) and apply the
    // rest exactly once.
    const raw = await createRawTestDb();
    const broken: Migration[] = [
      { id: 'mig_ok', sql: `CREATE TABLE mig_ok (x INTEGER);` },
      { id: 'mig_bad', sql: `THIS IS NOT VALID SQL;` },
    ];
    await expect(runMigrations(raw, broken)).rejects.toThrow();

    const fixed: Migration[] = [
      { id: 'mig_ok', sql: `CREATE TABLE mig_ok (x INTEGER);` }, // would throw "table exists" if re-run
      { id: 'mig_bad', sql: `CREATE TABLE mig_bad (x INTEGER);` },
    ];
    await expect(runMigrations(raw, fixed)).resolves.toBeUndefined();

    const ids = (await raw.all<{ id: string }>(`SELECT id FROM _migrations`)).map(
      (r) => r.id,
    );
    expect(ids.sort()).toEqual(['mig_bad', 'mig_ok']);
  });

  it('upgrades a legacy device (old schema, no _migrations table)', async () => {
    // Devices installed before the runner ran MIGRATION_001 directly on every
    // boot — so they have the three tables but no _migrations table and none of
    // the 002 sync columns. The runner must bring them current without throwing
    // "duplicate column" (001 is IF NOT EXISTS) and must backfill 002.
    const raw = await createRawTestDb();
    await raw.exec(MIGRATION_001); // simulate the pre-runner boot path
    // A row that pre-dates the sync metadata, to prove 002's backfill runs.
    await raw.run(
      `INSERT INTO predictions
         (id, user_id, title, category, confidence, created_at, due_date, status, integrity_bonus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'legacy-1',
        'u1',
        'old prediction',
        'work',
        50,
        '2026-01-01T00:00:00.000Z',
        '2026-02-01T00:00:00.000Z',
        'pending',
        1,
      ],
    );

    await expect(runMigrations(raw)).resolves.toBeUndefined();

    // Every registered migration is now recorded exactly once.
    const ids = (await raw.all<{ id: string }>(`SELECT id FROM _migrations`)).map(
      (r) => r.id,
    );
    expect(ids.sort()).toEqual(MIGRATIONS.map((m) => m.id).sort());

    // 002's columns exist...
    const cols = new Set(
      (await raw.all<{ name: string }>(`PRAGMA table_info(predictions)`)).map(
        (c) => c.name,
      ),
    );
    expect(cols.has('updated_at')).toBe(true);
    expect(cols.has('dirty')).toBe(true);

    // ...and the legacy row was backfilled (updated_at = created_at, dirty = 1)
    // so the next sync sweep mirrors it up.
    const row = await raw.get<{ updated_at: string; dirty: number }>(
      `SELECT updated_at, dirty FROM predictions WHERE id = ?`,
      ['legacy-1'],
    );
    expect(row?.updated_at).toBe('2026-01-01T00:00:00.000Z');
    expect(row?.dirty).toBe(1);
  });
});
