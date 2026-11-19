// Tests for the sync metadata maintained by the predictions helpers and the
// internal sync-only helpers (listDirtyPredictions, upsertPredictionFromRemote,
// markPredictionSynced, getPredictionUpdatedAt). The public CRUD paths
// already have their own tests in predictions.test.ts.

import type { Prediction, PredictionWireRow } from '@/types';

import { getDb, setDbForTests } from './client';

import {
  getPrediction,
  getPredictionUpdatedAt,
  insertPrediction,
  listDirtyPredictions,
  markPredictionSynced,
  resolvePrediction,
  upsertPredictionFromRemote,
} from './predictions';
import { createTestDb } from './testing';

const samplePrediction = (overrides: Partial<Prediction> = {}): Prediction => ({
  id: 'p1',
  user_id: 'u1',
  title: 'Ship the prototype',
  category: 'work',
  confidence: 70,
  created_at: '2026-05-01T00:00:00.000Z',
  due_date: '2026-06-01T00:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
  ...overrides,
});

const sampleWire = (overrides: Partial<PredictionWireRow> = {}): PredictionWireRow => ({
  id: 'remote-1',
  user_id: 'u1',
  title: 'From the server',
  category: 'health',
  confidence: 80,
  created_at: '2026-05-01T00:00:00.000Z',
  due_date: '2026-06-01T00:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
  updated_at: '2026-05-20T12:00:00.000Z',
  ...overrides,
});

async function getRawRow(id: string): Promise<{ updated_at: string; dirty: number } | null> {
  return await getDb().get<{ updated_at: string; dirty: number }>(
    `SELECT updated_at, dirty FROM predictions WHERE id = ?`,
    [id],
  );
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
});

afterEach(() => {
  setDbForTests(null);
});

describe('predictions sync metadata maintenance', () => {
  it('insertPrediction sets dirty=1 and stamps updated_at', async () => {
    const before = Date.now();
    await insertPrediction(samplePrediction());
    const row = await getRawRow('p1');
    expect(row).not.toBeNull();
    expect(row?.dirty).toBe(1);
    const t = new Date(row!.updated_at).getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('resolvePrediction bumps updated_at and re-sets dirty=1', async () => {
    await insertPrediction(samplePrediction());
    // Force dirty=0 to prove resolve flips it back.
    await getDb().run(`UPDATE predictions SET dirty = 0 WHERE id = ?`, ['p1']);
    const initial = await getRawRow('p1');
    expect(initial?.dirty).toBe(0);

    // Wait at least 1ms so ISO timestamps differ.
    await new Promise((r) => setTimeout(r, 5));
    await resolvePrediction('p1', 'resolved_yes');

    const after = await getRawRow('p1');
    expect(after?.dirty).toBe(1);
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(initial!.updated_at).getTime(),
    );
  });
});

describe('listDirtyPredictions', () => {
  it('returns only rows where dirty=1, scoped to the user, ordered by updated_at', async () => {
    await insertPrediction(samplePrediction({ id: 'a' }));
    await new Promise((r) => setTimeout(r, 2));
    await insertPrediction(samplePrediction({ id: 'b' }));
    await new Promise((r) => setTimeout(r, 2));
    await insertPrediction(samplePrediction({ id: 'c', user_id: 'u2' }));
    // Mark b as clean.
    await getDb().run(`UPDATE predictions SET dirty = 0 WHERE id = ?`, ['b']);

    const dirty = await listDirtyPredictions('u1');
    expect(dirty.map((r) => r.id)).toEqual(['a']);
    expect(dirty[0].integrity_bonus).toBe(false);
    expect(typeof dirty[0].updated_at).toBe('string');
  });

  it('returns an empty list when nothing is dirty', async () => {
    await insertPrediction(samplePrediction({ id: 'a' }));
    await getDb().run(`UPDATE predictions SET dirty = 0`);
    expect(await listDirtyPredictions('u1')).toEqual([]);
  });
});

describe('upsertPredictionFromRemote', () => {
  it('inserts a remote row with dirty=0 when no local copy exists', async () => {
    const wire = sampleWire({ id: 'remote-1' });
    await upsertPredictionFromRemote(wire);

    const row = await getRawRow('remote-1');
    expect(row?.dirty).toBe(0);
    expect(row?.updated_at).toBe(wire.updated_at);
  });

  it('overwrites an existing local row and clears dirty', async () => {
    await insertPrediction(samplePrediction({ id: 'p1', title: 'old' }));
    expect((await getRawRow('p1'))?.dirty).toBe(1);

    await upsertPredictionFromRemote(
      sampleWire({ id: 'p1', title: 'new from server', updated_at: '2026-06-15T00:00:00.000Z' }),
    );
    const row = await getRawRow('p1');
    expect(row?.dirty).toBe(0);
    expect(row?.updated_at).toBe('2026-06-15T00:00:00.000Z');

    // Title was overwritten too.
    const titled = await getDb().get<{ title: string }>(
      `SELECT title FROM predictions WHERE id = ?`,
      ['p1'],
    );
    expect(titled?.title).toBe('new from server');
  });

  it('round-trips integrity_bonus as boolean', async () => {
    await upsertPredictionFromRemote(sampleWire({ id: 'ib', integrity_bonus: true }));
    const stored = await getDb().get<{ integrity_bonus: number }>(
      `SELECT integrity_bonus FROM predictions WHERE id = ?`,
      ['ib'],
    );
    expect(stored?.integrity_bonus).toBe(1);

    const dirty = await listDirtyPredictions('u1');
    // It was upserted with dirty=0, so it should NOT appear here.
    expect(dirty.find((r) => r.id === 'ib')).toBeUndefined();
  });
});

describe('markPredictionSynced', () => {
  it('clears dirty when updated_at matches what was pushed', async () => {
    await insertPrediction(samplePrediction({ id: 'p1' }));
    const before = await getRawRow('p1');
    expect(before?.dirty).toBe(1);

    await markPredictionSynced('p1', before!.updated_at);
    const after = await getRawRow('p1');
    expect(after?.dirty).toBe(0);
  });

  it('does NOT clear dirty when updated_at has moved (concurrent write)', async () => {
    await insertPrediction(samplePrediction({ id: 'p1' }));
    const before = await getRawRow('p1');

    // Simulate a write that happened between push start and ack.
    await new Promise((r) => setTimeout(r, 2));
    await resolvePrediction('p1', 'resolved_yes');
    const after = await getRawRow('p1');
    expect(after?.updated_at).not.toBe(before?.updated_at);

    // markPredictionSynced uses the pre-write timestamp — should no-op.
    await markPredictionSynced('p1', before!.updated_at);
    const final = await getRawRow('p1');
    expect(final?.dirty).toBe(1);
  });
});

describe('getPredictionUpdatedAt', () => {
  it('returns the row updated_at or null when missing', async () => {
    expect(await getPredictionUpdatedAt('nope')).toBeNull();

    await insertPrediction(samplePrediction({ id: 'p1' }));
    const got = await getPredictionUpdatedAt('p1');
    expect(typeof got).toBe('string');
    expect(got).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// Roadmap D45: the date a prediction was reworded.
describe('title_edited_at across sync', () => {
  const EDITED = '2026-05-10T09:00:00.000Z';

  it('goes up with the row: the dirty row carries it', async () => {
    await insertPrediction(samplePrediction({ title_edited_at: EDITED }));
    const [row] = await listDirtyPredictions('u1');
    expect(row).toMatchObject({
      id: 'p1',
      title: 'Ship the prototype',
      title_edited_at: EDITED,
    });
  });

  // Record audit 2026-11-18: this test said "is never cleared by a pull from
  // a server without it", the rule for a server before migration 008. A
  // newer remote row now wins whole: its words come with its own date, here
  // none, never with this phone's date for other words.
  it('comes down with the newer row that wins, null included', async () => {
    await insertPrediction(samplePrediction({ title_edited_at: EDITED }));
    await upsertPredictionFromRemote(
      sampleWire({
        id: 'p1',
        title: 'Edited elsewhere',
        title_edited_at: null,
        updated_at: '2099-01-01T00:00:00.000Z',
      }),
    );
    const after = await getPrediction('p1');
    expect(after?.title).toBe('Edited elsewhere');
    expect(after).not.toHaveProperty('title_edited_at');
  });

  // Record audit 2026-11-18: this test said "keeps the later of the two
  // dates". The date is the winning row's, earlier or later.
  it("takes the winning row's date, earlier or later than this phone's", async () => {
    await insertPrediction(samplePrediction({ title_edited_at: EDITED }));
    await upsertPredictionFromRemote(
      sampleWire({ id: 'p1', title_edited_at: '2026-05-12T09:00:00+00:00', updated_at: '2099-01-01T00:00:00.000Z' }),
    );
    expect((await getPrediction('p1'))?.title_edited_at).toBe('2026-05-12T09:00:00+00:00');
    await upsertPredictionFromRemote(
      sampleWire({ id: 'p1', title_edited_at: '2026-05-02T09:00:00+00:00', updated_at: '2099-01-02T00:00:00.000Z' }),
    );
    expect((await getPrediction('p1'))?.title_edited_at).toBe('2026-05-02T09:00:00+00:00');
  });

  // The record auditor's case: phone B rewords P on Tuesday and isn't opened
  // again; phone A, with the old words, answers Yes that evening and syncs; B
  // opens on Wednesday and pulls A's newer row. B must hold exactly A's row,
  // so both phones judge the answer the same way (scored on both).
  it('leaves both phones holding the same words and date after a pull', async () => {
    const LOGGED = '2026-05-04T09:00:00.000Z'; // Monday
    const TUESDAY_REWORD = '2026-05-05T08:00:00.000Z';
    // Phone B's copy: reworded on Tuesday, not yet pushed.
    await insertPrediction(
      samplePrediction({
        title: 'Ship the prototype by Friday',
        created_at: LOGGED,
        due_date: '2026-05-05T12:00:00.000Z',
        title_edited_at: TUESDAY_REWORD,
      }),
    );
    // Phone A's row as the server holds it: the old words, answered Yes on
    // Tuesday evening, never reworded.
    const fromA = sampleWire({
      id: 'p1',
      title: 'Ship the prototype',
      category: 'work',
      confidence: 70,
      created_at: LOGGED,
      due_date: '2026-05-05T12:00:00.000Z',
      status: 'resolved_yes',
      resolved_at: '2026-05-05T20:00:00.000Z',
      title_edited_at: null,
      updated_at: '2026-05-05T20:00:00.000Z',
    });

    await upsertPredictionFromRemote(fromA);

    const onB = await getPrediction('p1');
    expect(onB).toEqual({
      id: 'p1',
      user_id: 'u1',
      title: 'Ship the prototype',
      category: 'work',
      confidence: 70,
      created_at: LOGGED,
      due_date: '2026-05-05T12:00:00.000Z',
      status: 'resolved_yes',
      resolved_at: '2026-05-05T20:00:00.000Z',
      reflection: null,
      integrity_bonus: false,
    });
    // And when B next pushes, it states the same (null) date A has.
    await getDb().run(`UPDATE predictions SET dirty = 1 WHERE id = 'p1'`);
    const [up] = await listDirtyPredictions('u1');
    expect(up.title_edited_at).toBeNull();
  });

  // Security review 2026-11-18: postgrest-js names the union of a batch's
  // keys as the columns, and a row without one was written with NULL for it.
  it('is on every row that goes up, null included, so no row takes another’s', async () => {
    await insertPrediction(samplePrediction({ id: 'reworded', title_edited_at: EDITED }));
    await insertPrediction(samplePrediction({ id: 'never' }));

    const batch = await listDirtyPredictions('u1');
    const byId = Object.fromEntries(batch.map((r) => [r.id, r]));
    expect(byId.reworded.title_edited_at).toBe(EDITED);
    expect(byId.never).toHaveProperty('title_edited_at', null);

    // What postgrest-js sends as `columns` for a batch upsert: every key any
    // row has. Each row carries every one of them itself.
    const union = new Set(batch.flatMap((r) => Object.keys(r)));
    for (const row of batch) expect(new Set(Object.keys(row))).toEqual(union);
  });

  it('reads as absent on a row never reworded', async () => {
    await insertPrediction(samplePrediction());
    expect(await getPrediction('p1')).not.toHaveProperty('title_edited_at');
  });
});
