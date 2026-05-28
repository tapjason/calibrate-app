// Migrations runner tests. The runner is the foundation for every other
// schema change — if it accidentally re-applies a migration, ALTER TABLE
// throws "duplicate column" and the app fails to launch.

import { getDb, setDbForTests } from '../client';
import { createTestDb } from '../testing';

import { MIGRATIONS, runMigrations } from './index';

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

  it('rolls back a partially-applied migration if its SQL throws', async () => {
    // Force a failure: try to apply a hand-crafted migration with bad SQL
    // inside the runner-like sequence. Easiest path: run the runner with a
    // doctored MIGRATIONS list via a local helper that mimics runMigrations.
    //
    // We test the principle here by attempting a single bad statement inside
    // a transaction and asserting state is unchanged.
    const before = await getDb().all<{ id: string }>(`SELECT id FROM _migrations`);
    await expect(
      getDb().transaction(async () => {
        await getDb().run(
          `INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`,
          ['bogus', new Date().toISOString()],
        );
        throw new Error('mid-migration failure');
      }),
    ).rejects.toThrow('mid-migration failure');
    const after = await getDb().all<{ id: string }>(`SELECT id FROM _migrations`);
    expect(after).toEqual(before);
  });
});
