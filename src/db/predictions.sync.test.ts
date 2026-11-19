// Tests for the sync metadata maintained by the predictions helpers and the
// internal sync-only helpers (listDirtyPredictions, upsertPredictionFromRemote,
// markPredictionSynced, getPredictionUpdatedAt). The public CRUD paths
// already have their own tests in predictions.test.ts.

import type { PendingTombstone, Prediction, PredictionWireRow } from '@/types';

import { getDb, setDbForTests, withTransaction } from './client';

import {
  answerSkippedPrediction,
  correctPredictionOutcome,
  countUnsynced,
  deletePrediction,
  getPrediction,
  getPredictionUpdatedAt,
  insertPrediction,
  isDeletedHere,
  listDeletions,
  listDirtyPredictions,
  listDirtyPredictionsSettled,
  listOffsetBackfill,
  listPendingDeletions,
  listPendingDeletionsSettled,
  listPendingTombstonesSettled,
  markDeletionPushed,
  markPredictionSynced,
  reconcileTombstoneWithRemote,
  resolvePrediction,
  tombstoneCovers,
  updatePrediction,
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

/** Run `fn` with Date frozen at `iso`, so every write lands in one millisecond. */
async function inOneMillisecond<T>(iso: string, fn: () => Promise<T>): Promise<T> {
  jest.useFakeTimers({
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
    now: new Date(iso),
  });
  try {
    return await fn();
  } finally {
    jest.useRealTimers();
  }
}

// Review round 5: a push that read a row must never mark a later write to
// it clean, even one made in the same millisecond.
describe('a write after a push read the row', () => {
  it('keeps the row dirty when the next write lands in the same millisecond', async () => {
    await inOneMillisecond('2026-11-19T10:00:00.000Z', async () => {
      await insertPrediction(samplePrediction());
      const [pushed] = await listDirtyPredictions('u1');
      await resolvePrediction('p1', 'resolved_yes');
      expect((await getRawRow('p1'))?.updated_at).not.toBe(pushed.updated_at);
      await markPredictionSynced('p1', pushed.updated_at);
      expect((await getRawRow('p1'))?.dirty).toBe(1);
    });
  });

  it('stamps each local write later than the last, even in one millisecond', async () => {
    await inOneMillisecond('2026-11-19T10:00:00.000Z', async () => {
      await insertPrediction(samplePrediction({ id: 'a' }));
      await insertPrediction(samplePrediction({ id: 'b' }));
      const a = (await getRawRow('a'))!.updated_at;
      const b = (await getRawRow('b'))!.updated_at;
      expect(b > a).toBe(true);
    });
  });
});

// Review round 5: answering a Can't tell was "reopen, then answer", two
// statements a push could read between.
describe('answerSkippedPrediction', () => {
  const skipped = () =>
    insertPrediction(
      samplePrediction({
        status: 'skipped',
        resolved_at: '2026-06-01T20:00:00.000Z',
        reflection: 'No idea',
      }),
    );

  it('goes from Can’t tell to the answer in one statement, never through open', async () => {
    await skipped();
    const db = getDb();
    const realRun = db.run.bind(db);
    const statements: string[] = [];
    db.run = async (sql, params) => {
      statements.push(sql);
      return realRun(sql, params);
    };
    try {
      await answerSkippedPrediction('p1', 'resolved_no', 'Turned out no', {
        at: '2026-06-03T09:00:00.000Z',
      });
    } finally {
      db.run = realRun;
    }
    expect(statements).toHaveLength(1);
    expect(statements[0]).not.toMatch(/'pending'/);
    // No answer offset since review round 6: the time alone.
    expect(statements[0]).not.toMatch(/resolved_utc_offset_min/);
    expect(await getPrediction('p1')).toMatchObject({
      status: 'resolved_no',
      resolved_at: '2026-06-03T09:00:00.000Z',
      reflection: 'Turned out no',
    });
    expect((await getRawRow('p1'))?.dirty).toBe(1);
  });

  it('leaves a Yes, a No and an open prediction alone', async () => {
    await insertPrediction(samplePrediction({ id: 'yes', status: 'resolved_yes', resolved_at: '2026-06-01T20:00:00.000Z' }));
    await insertPrediction(samplePrediction({ id: 'open' }));
    await answerSkippedPrediction('yes', 'resolved_no');
    await answerSkippedPrediction('open', 'resolved_no');
    expect((await getPrediction('yes'))?.status).toBe('resolved_yes');
    expect(await getPrediction('open')).toMatchObject({ status: 'pending', resolved_at: null });
  });

  it('is never marked clean by a push that read the Can’t tell, in the same millisecond', async () => {
    await inOneMillisecond('2026-11-19T10:00:00.000Z', async () => {
      await skipped();
      const [pushed] = await listDirtyPredictions('u1');
      expect(pushed.status).toBe('skipped');
      await answerSkippedPrediction('p1', 'resolved_yes');
      await markPredictionSynced('p1', pushed.updated_at);
      expect(await getRawRow('p1')).toMatchObject({ dirty: 1 });
      const [again] = await listDirtyPredictions('u1');
      expect(again.status).toBe('resolved_yes');
    });
  });
});

// Review round 5: on the one connection, a read that isn't queued sees a
// transaction's uncommitted writes. The push reads through the queue.
describe('the settled reads for the push', () => {
  /** A transaction that writes, then waits for `release` before ending. */
  function heldTransaction(write: () => Promise<void>, rollBack = false) {
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const tx = withTransaction(async () => {
      await write();
      await held;
      if (rollBack) throw new Error('rolled back');
    });
    return { tx, release };
  }

  const tick = () => new Promise((r) => setTimeout(r, 10));

  it('waits for a transaction open when the read is issued, then sees what it committed', async () => {
    const { tx, release } = heldTransaction(() => insertPrediction(samplePrediction({ id: 'new' })));
    await tick();
    // The plain read sees the uncommitted row: the hazard.
    expect((await listDirtyPredictions('u1')).map((r) => r.id)).toEqual(['new']);

    let settled: PredictionWireRow[] | null = null;
    const read = listDirtyPredictionsSettled('u1').then((rows) => {
      settled = rows;
    });
    await tick();
    expect(settled).toBeNull();

    release();
    await Promise.all([tx, read]);
    expect(settled!.map((r) => r.id)).toEqual(['new']);
  });

  it('never sees a transaction that rolls back', async () => {
    await insertPrediction(samplePrediction({ id: 'kept' }));
    const { tx, release } = heldTransaction(async () => {
      await insertPrediction(samplePrediction({ id: 'ghost' }));
      await resolvePrediction('kept', 'resolved_yes');
    }, true);
    await tick();
    const read = listDirtyPredictionsSettled('u1');
    release();
    await expect(tx).rejects.toThrow('rolled back');
    const rows = await read;
    expect(rows.map((r) => r.id)).toEqual(['kept']);
    expect(rows[0].status).toBe('pending');
  });

  // Review round 6: the offset backfill reads as the push does, so an offset
  // a rolled-back write left for a moment never goes up.
  it('reads the offset backfill the same way: an open write waits, a rolled-back one is never seen', async () => {
    await insertPrediction(samplePrediction({ id: 'kept', created_utc_offset_min: -300 }));
    const rolled = heldTransaction(async () => {
      await insertPrediction(samplePrediction({ id: 'ghost', created_utc_offset_min: 60 }));
      await updatePrediction(
        'kept',
        { title: 'Other words', category: 'work', due_date: '2026-06-02T00:00:00.000Z' },
        { rewordedAt: '2026-05-02T00:00:00.000Z', rewordedUtcOffsetMin: 60 },
      );
    }, true);
    await tick();
    const duringRollback = listOffsetBackfill('u1');
    rolled.release();
    await expect(rolled.tx).rejects.toThrow('rolled back');
    expect(await duringRollback).toEqual([
      {
        id: 'kept',
        created_at: '2026-05-01T00:00:00.000Z',
        created_utc_offset_min: -300,
        title_edited_at: null,
        title_edited_utc_offset_min: null,
      },
    ]);

    const committed = heldTransaction(() =>
      insertPrediction(
        samplePrediction({ id: 'later', created_at: '2026-05-03T00:00:00.000Z', created_utc_offset_min: 60 }),
      ),
    );
    await tick();
    let ids: string[] | null = null;
    const read = listOffsetBackfill('u1').then((rows) => {
      ids = rows.map((r) => r.id);
    });
    await tick();
    expect(ids).toBeNull();
    committed.release();
    await Promise.all([committed.tx, read]);
    expect(ids).toEqual(['kept', 'later']);
  });

  it('reads pending deletions the same way: an open delete waits, a rolled-back one is never seen', async () => {
    await insertPrediction(samplePrediction({ id: 'a' }));
    await insertPrediction(samplePrediction({ id: 'b' }));

    const rolled = heldTransaction(() => deletePrediction('a'), true);
    await tick();
    expect(await listPendingDeletions('u1')).toEqual(['a']);
    const duringRollback = listPendingDeletionsSettled('u1');
    rolled.release();
    await expect(rolled.tx).rejects.toThrow('rolled back');
    expect(await duringRollback).toEqual([]);

    const committed = heldTransaction(() => deletePrediction('b'));
    await tick();
    let ids: string[] | null = null;
    const read = listPendingDeletionsSettled('u1').then((r) => {
      ids = r;
    });
    await tick();
    expect(ids).toBeNull();
    committed.release();
    await Promise.all([committed.tx, read]);
    expect(ids).toEqual(['b']);
  });

  it('fails as the plain reads fail, and leaves the queue working', async () => {
    const db = getDb();
    const realAll = db.all.bind(db);
    db.all = async () => {
      throw new Error('disk I/O error');
    };
    try {
      await expect(listDirtyPredictions('u1')).rejects.toThrow('disk I/O error');
      await expect(listDirtyPredictionsSettled('u1')).rejects.toThrow('disk I/O error');
      await expect(listPendingDeletions('u1')).rejects.toThrow('disk I/O error');
      await expect(listPendingDeletionsSettled('u1')).rejects.toThrow('disk I/O error');
    } finally {
      db.all = realAll;
    }
    await withTransaction(() => insertPrediction(samplePrediction({ id: 'after' })));
    expect((await listDirtyPredictionsSettled('u1')).map((r) => r.id)).toEqual(['after']);

    setDbForTests(null);
    await expect(listDirtyPredictions('u1')).rejects.toThrow('Database not initialized');
    await expect(listDirtyPredictionsSettled('u1')).rejects.toThrow('Database not initialized');
    await expect(listPendingDeletionsSettled('u1')).rejects.toThrow('Database not initialized');
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

// D34/D45, record audit 2026-11-19: "There is no way to put any answer back
// to open." A stale phone's newer edit of its open copy reopened a prediction
// answered elsewhere, since the pull took the newer row whole.
describe('a pull never undoes an answer', () => {
  const ANSWERED_AT = '2026-11-19T03:00:00.000Z';

  /** This phone's copy: answered, with a note and the logging offset, pushed. */
  async function answeredHere(status: 'resolved_yes' | 'resolved_no' | 'skipped') {
    await insertPrediction(samplePrediction({ category: 'health', created_utc_offset_min: -300 }));
    await resolvePrediction('p1', status, 'Felt sure', { at: ANSWERED_AT });
    const row = await getRawRow('p1');
    await markPredictionSynced('p1', row!.updated_at);
  }

  // The auditor's last-write-wins case: phone B, not yet pulled, moves its
  // open copy to another category after phone A answered Yes. Main session,
  // 2026-11-19 (the strict direction): the stale copy is stale whole, so none
  // of its edits land on the answer.
  it("keeps this phone's whole answered row when a newer open copy comes down", async () => {
    await answeredHere('resolved_yes');
    const before = await getPrediction('p1');
    const staleOpenCopy = sampleWire({
      id: 'p1',
      title: 'Ship the prototype',
      category: 'personal',
      status: 'pending',
      resolved_at: null,
      reflection: null,
      updated_at: '2099-01-01T00:00:00.000Z',
    });

    await upsertPredictionFromRemote(staleOpenCopy);

    expect(await getPrediction('p1')).toEqual(before);
    expect(before).toMatchObject({
      category: 'health',
      status: 'resolved_yes',
      resolved_at: ANSWERED_AT,
      reflection: 'Felt sure',
      created_utc_offset_min: -300,
    });
    // Marked to go back up, newer than the copy it overrode, so the server
    // and the other phone end on the answer.
    const raw = await getRawRow('p1');
    expect(raw?.dirty).toBe(1);
    expect(raw!.updated_at > staleOpenCopy.updated_at).toBe(true);
    const [up] = await listDirtyPredictions('u1');
    expect(up).toMatchObject({
      id: 'p1',
      category: 'health',
      status: 'resolved_yes',
      resolved_at: ANSWERED_AT,
    });
  });

  // D45 (new words after an answer) and D65 (a move nothing counted): a
  // stale copy with other words, category and due date, reworded on its
  // phone, changes nothing here.
  it('lands none of a stale copy’s words, category, due date or rewording on the answer', async () => {
    await insertPrediction(
      samplePrediction({
        category: 'health',
        title_edited_at: '2026-05-02T09:00:00.000Z',
        created_utc_offset_min: -300,
        title_edited_utc_offset_min: -300,
      }),
    );
    await resolvePrediction('p1', 'resolved_no', 'Missed it', { at: ANSWERED_AT });
    await markPredictionSynced('p1', (await getRawRow('p1'))!.updated_at);
    const before = await getPrediction('p1');
    const rawBefore = await getDb().get<Record<string, unknown>>(
      `SELECT * FROM predictions WHERE id = 'p1'`,
    );

    const staleOpenCopy = sampleWire({
      id: 'p1',
      title: 'Ship nothing at all',
      category: 'personal',
      confidence: 70,
      created_at: '2026-05-01T00:00:00.000Z',
      due_date: '2026-07-15T00:00:00.000Z',
      status: 'pending',
      resolved_at: null,
      reflection: null,
      title_edited_at: '2026-11-20T09:00:00.000Z',
      created_utc_offset_min: 0,
      title_edited_utc_offset_min: 0,
      updated_at: '2099-01-01T00:00:00.000Z',
    });
    await upsertPredictionFromRemote(staleOpenCopy);

    const after = await getPrediction('p1');
    expect(after).toEqual(before);
    expect(after).toMatchObject({
      title: 'Ship the prototype',
      category: 'health',
      due_date: '2026-06-01T00:00:00.000Z',
      title_edited_at: '2026-05-02T09:00:00.000Z',
      title_edited_utc_offset_min: -300,
      created_utc_offset_min: -300,
      status: 'resolved_no',
      reflection: 'Missed it',
    });
    // Every column as it was but the push marks: dirty again, updated_at on.
    const rawAfter = await getDb().get<Record<string, unknown>>(
      `SELECT * FROM predictions WHERE id = 'p1'`,
    );
    expect({ ...rawAfter, updated_at: 'x', dirty: 'x' }).toEqual({
      ...rawBefore,
      updated_at: 'x',
      dirty: 'x',
    });
    expect(rawAfter?.dirty).toBe(1);
    expect(String(rawAfter?.updated_at) > staleOpenCopy.updated_at).toBe(true);
    // Pushed back as it stands here.
    const [up] = await listDirtyPredictions('u1');
    expect(up).toMatchObject({
      title: 'Ship the prototype',
      category: 'health',
      due_date: '2026-06-01T00:00:00.000Z',
      title_edited_at: '2026-05-02T09:00:00.000Z',
      status: 'resolved_no',
    });
  });

  it("never moves this phone's updated_at backwards when its row stands", async () => {
    await answeredHere('resolved_yes');
    // This phone's clock ran ahead when it answered.
    await getDb().run(
      `UPDATE predictions SET updated_at = '2100-01-01T00:00:00.000Z' WHERE id = 'p1'`,
    );
    await upsertPredictionFromRemote(
      sampleWire({ id: 'p1', status: 'pending', resolved_at: null, updated_at: '2099-01-01T00:00:00.000Z' }),
    );
    expect(await getRawRow('p1')).toEqual({ updated_at: '2100-01-01T00:00:00.000Z', dirty: 1 });
  });

  it('pushes back later than an open copy written with a Postgres timestamp', async () => {
    await answeredHere('resolved_no');
    const serverTime = '2099-03-04T05:06:07.123456+00:00';
    await upsertPredictionFromRemote(
      sampleWire({ id: 'p1', status: 'pending', resolved_at: null, updated_at: serverTime }),
    );
    const raw = await getRawRow('p1');
    expect(raw!.updated_at > serverTime).toBe(true);
    expect(Date.parse(raw!.updated_at)).toBeGreaterThan(Date.parse('2099-03-04T05:06:07.123Z'));
    expect((await getPrediction('p1'))?.status).toBe('resolved_no');
  });

  it("keeps a Can't tell when a newer open copy comes down", async () => {
    await answeredHere('skipped');
    await upsertPredictionFromRemote(
      sampleWire({ id: 'p1', status: 'pending', resolved_at: null, updated_at: '2099-01-01T00:00:00.000Z' }),
    );
    expect(await getPrediction('p1')).toMatchObject({ status: 'skipped', resolved_at: ANSWERED_AT });
    expect((await getRawRow('p1'))?.dirty).toBe(1);
  });

  it("refuses to turn a Yes or No into a Can't tell (D34)", async () => {
    await answeredHere('resolved_yes');
    await upsertPredictionFromRemote(
      sampleWire({
        id: 'p1',
        status: 'skipped',
        resolved_at: '2026-11-20T09:00:00.000Z',
        reflection: null,
        updated_at: '2099-01-01T00:00:00.000Z',
      }),
    );
    expect(await getPrediction('p1')).toMatchObject({
      status: 'resolved_yes',
      resolved_at: ANSWERED_AT,
      reflection: 'Felt sure',
    });
    expect((await getRawRow('p1'))?.dirty).toBe(1);
  });

  it('still takes Yes to No from another phone: that is "Change answer"', async () => {
    await answeredHere('resolved_yes');
    await upsertPredictionFromRemote(
      sampleWire({
        id: 'p1',
        category: 'health',
        status: 'resolved_no',
        resolved_at: ANSWERED_AT,
        reflection: 'Felt sure',
        updated_at: '2099-01-01T00:00:00.000Z',
      }),
    );
    expect((await getPrediction('p1'))?.status).toBe('resolved_no');
    const raw = await getRawRow('p1');
    expect(raw).toEqual({ updated_at: '2099-01-01T00:00:00.000Z', dirty: 0 });
  });

  it("still takes a Yes for a Can't tell: a skip is answered later", async () => {
    await answeredHere('skipped');
    await upsertPredictionFromRemote(
      sampleWire({
        id: 'p1',
        status: 'resolved_yes',
        resolved_at: '2026-11-21T09:00:00.000Z',
        reflection: null,
        updated_at: '2099-01-01T00:00:00.000Z',
      }),
    );
    expect(await getPrediction('p1')).toMatchObject({
      status: 'resolved_yes',
      resolved_at: '2026-11-21T09:00:00.000Z',
      reflection: null,
    });
    expect((await getRawRow('p1'))?.dirty).toBe(0);
  });

  it('still takes an answer from another phone onto an open copy here', async () => {
    await insertPrediction(samplePrediction());
    await upsertPredictionFromRemote(
      sampleWire({
        id: 'p1',
        status: 'resolved_no',
        resolved_at: ANSWERED_AT,
        updated_at: '2099-01-01T00:00:00.000Z',
      }),
    );
    expect(await getPrediction('p1')).toMatchObject({ status: 'resolved_no', resolved_at: ANSWERED_AT });
    expect((await getRawRow('p1'))?.dirty).toBe(0);
  });
});

// Owner decision 2026-11-19: sign-out removes the account's rows, so it
// first asks how many changes the server doesn't have yet.
describe('countUnsynced', () => {
  it('counts dirty predictions and deletions not yet pushed, for that user only', async () => {
    expect(await countUnsynced('u1')).toBe(0);
    await insertPrediction(samplePrediction({ id: 'a' }));
    await insertPrediction(samplePrediction({ id: 'b' }));
    await insertPrediction(samplePrediction({ id: 'theirs', user_id: 'u2' }));
    expect(await countUnsynced('u1')).toBe(2);

    await deletePrediction('b');
    // One dirty row and one deletion waiting.
    expect(await countUnsynced('u1')).toBe(2);
    expect(await countUnsynced('u2')).toBe(1);

    const a = await getRawRow('a');
    await markPredictionSynced('a', a!.updated_at);
    expect(await countUnsynced('u1')).toBe(1);
    await markDeletionPushed('b');
    expect(await countUnsynced('u1')).toBe(0);
  });

  it('counts a change made after the last push, and a pulled row as synced', async () => {
    await insertPrediction(samplePrediction({ id: 'a' }));
    const a = await getRawRow('a');
    await markPredictionSynced('a', a!.updated_at);
    await new Promise((r) => setTimeout(r, 2));
    await updatePrediction('a', {
      title: 'Ship it now',
      category: 'work',
      due_date: '2026-06-02T00:00:00.000Z',
    });
    expect(await countUnsynced('u1')).toBe(1);
    await correctPredictionOutcome('a', 'resolved_yes'); // a no-op on an open one
    expect(await countUnsynced('u1')).toBe(1);

    await upsertPredictionFromRemote(sampleWire({ id: 'pulled' }));
    expect(await countUnsynced('u1')).toBe(1);
  });
});

// Review round 6 (server review): a stale phone's delete of its open copy
// must not take away an answer another phone gave afterwards.
describe('reconcileTombstoneWithRemote', () => {
  const AFTER = '2099-01-01T09:00:00.000Z';
  const BEFORE = '2000-01-01T09:00:00.000Z';

  /** An open prediction this phone deleted (its tombstone counted, as on the eve). */
  async function deletedHere(opts: { pushed?: boolean; userId?: string } = {}) {
    await insertPrediction(samplePrediction({ user_id: opts.userId ?? 'u1' }));
    await deletePrediction('p1', { counted: true });
    if (opts.pushed) await markDeletionPushed('p1');
  }
  const answeredElsewhere = (over: Partial<PredictionWireRow> = {}) =>
    sampleWire({
      id: 'p1',
      title: 'Ship the prototype',
      category: 'work',
      status: 'resolved_no',
      resolved_at: AFTER,
      reflection: 'Answered on the other phone',
      updated_at: '2099-01-01T09:00:01.000Z',
      ...over,
    });

  it.each([
    ['not yet pushed', false],
    ['already pushed', true],
  ])('restores an answer given after the delete (%s), and drops the tombstone uncounted', async (_label, pushed) => {
    await deletedHere({ pushed });
    expect(await listDeletions('u1')).toEqual([expect.objectContaining({ id: 'p1', counted: true })]);

    expect(await reconcileTombstoneWithRemote(answeredElsewhere())).toBe('restored');

    expect(await getPrediction('p1')).toMatchObject({
      status: 'resolved_no',
      resolved_at: AFTER,
      reflection: 'Answered on the other phone',
    });
    // Written as a pull writes: clean, the server already has it.
    expect((await getRawRow('p1'))?.dirty).toBe(0);
    expect(await listDeletions('u1')).toEqual([]);
    expect(await isDeletedHere('p1')).toBe(false);
    expect(await listPendingDeletions('u1')).toEqual([]);
    expect(await countUnsynced('u1')).toBe(0);
  });

  it("restores a Can't tell given after the delete too", async () => {
    await deletedHere();
    expect(await reconcileTombstoneWithRemote(answeredElsewhere({ status: 'skipped' }))).toBe(
      'restored',
    );
    expect((await getPrediction('p1'))?.status).toBe('skipped');
  });

  it('reads a Postgres timestamp, microseconds and +00:00 included', async () => {
    await deletedHere();
    const row = answeredElsewhere({ resolved_at: '2099-01-01T09:00:00.123456+00:00' });
    expect(await reconcileTombstoneWithRemote(row)).toBe('restored');
  });

  it('keeps the tombstone for an open copy, which the delete outranks', async () => {
    await deletedHere();
    const open = answeredElsewhere({ status: 'pending', resolved_at: null, reflection: null });
    expect(await reconcileTombstoneWithRemote(open)).toBe('kept');
    expect(await getPrediction('p1')).toBeNull();
    expect(await listDeletions('u1')).toEqual([expect.objectContaining({ id: 'p1', counted: true })]);
    expect(await listPendingDeletions('u1')).toEqual(['p1']);
  });

  // Review round 7 (client reviewer and record auditor, a blocker): this
  // phone deleted its open copy, so it never saw any answer. Round 6 kept the
  // tombstone for an answer given before the delete, and the push took that
  // answer off the server. Whatever the times, the answer now outranks it.
  it('restores an answer given before the delete, or at the same moment: it deleted an open copy', async () => {
    await deletedHere();
    expect(await reconcileTombstoneWithRemote(answeredElsewhere({ resolved_at: BEFORE }))).toBe(
      'restored',
    );
    expect(await getPrediction('p1')).toMatchObject({ status: 'resolved_no', resolved_at: BEFORE });
    expect(await listDeletions('u1')).toEqual([]);

    await deletePrediction('p1', { counted: true, seen: { status: 'pending', resolved_at: null } });
    const [tomb] = await listDeletions('u1');
    expect(
      await reconcileTombstoneWithRemote(answeredElsewhere({ resolved_at: tomb.deleted_at })),
    ).toBe('restored');
    expect(await isDeletedHere('p1')).toBe(false);
  });

  it("restores an answer whose time can't be read: an open copy's deletion never saw it", async () => {
    await deletedHere();
    expect(await reconcileTombstoneWithRemote(answeredElsewhere({ resolved_at: 'not a date' }))).toBe(
      'restored',
    );
    expect(await isDeletedHere('p1')).toBe(false);
    await deletePrediction('p1', { seen: { status: 'pending', resolved_at: null } });
    expect(await reconcileTombstoneWithRemote(answeredElsewhere({ resolved_at: null }))).toBe(
      'restored',
    );
    expect(await isDeletedHere('p1')).toBe(false);
  });

  // A deliberate delete of an answer this phone saw (inside its window, D34)
  // still deletes it: the server's copy is that very answer.
  describe('a deleted answer', () => {
    const ANSWERED_AT = '2099-01-01T08:00:00.000Z';
    async function deletedAnswer(status: 'resolved_yes' | 'resolved_no' | 'skipped' = 'resolved_no') {
      await insertPrediction(samplePrediction({ status, resolved_at: ANSWERED_AT }));
      await deletePrediction('p1', { counted: status !== 'skipped' });
    }

    it('keeps the tombstone for the same answer, however the server writes the time', async () => {
      await deletedAnswer();
      for (const resolvedAt of [
        ANSWERED_AT,
        '2099-01-01T08:00:00+00:00',
        '2099-01-01T08:00:00.000456+00:00',
        '2099-01-01T09:00:00+01:00',
      ]) {
        expect(await reconcileTombstoneWithRemote(answeredElsewhere({ resolved_at: resolvedAt }))).toBe(
          'kept',
        );
      }
      expect(await getPrediction('p1')).toBeNull();
      expect(await listDeletions('u1')).toEqual([expect.objectContaining({ id: 'p1', counted: true })]);
    });

    it('keeps the tombstone for an open copy: it carries no answer', async () => {
      await deletedAnswer();
      const open = answeredElsewhere({ status: 'pending', resolved_at: null });
      expect(await reconcileTombstoneWithRemote(open)).toBe('kept');
      expect(await isDeletedHere('p1')).toBe(true);
    });

    it('restores another answer: switched elsewhere (D34), or given at another time', async () => {
      await deletedAnswer('resolved_no');
      const switched = answeredElsewhere({ status: 'resolved_yes', resolved_at: ANSWERED_AT });
      expect(await reconcileTombstoneWithRemote(switched)).toBe('restored');
      expect(await getPrediction('p1')).toMatchObject({ status: 'resolved_yes', resolved_at: ANSWERED_AT });
      expect(await listDeletions('u1')).toEqual([]);

      await deletePrediction('p1', { counted: true });
      const later = answeredElsewhere({ status: 'resolved_yes', resolved_at: '2099-01-01T08:00:01.000Z' });
      expect(await reconcileTombstoneWithRemote(later)).toBe('restored');
      expect(await isDeletedHere('p1')).toBe(false);
    });

    it("restores a Yes or No given elsewhere to a Can't tell this phone deleted", async () => {
      await deletedAnswer('skipped');
      expect(
        await reconcileTombstoneWithRemote(answeredElsewhere({ status: 'resolved_yes', resolved_at: AFTER })),
      ).toBe('restored');
      expect((await getPrediction('p1'))?.status).toBe('resolved_yes');
    });

    it("restores the same status when either time can't be read: never removed unseen", async () => {
      await deletedAnswer();
      expect(await reconcileTombstoneWithRemote(answeredElsewhere({ resolved_at: 'not a date' }))).toBe(
        'restored',
      );
      await deletePrediction('p1', { counted: true });
      await getDb().run(`UPDATE prediction_deletions SET deleted_resolved_at = 'garbled' WHERE id = 'p1'`);
      expect(await reconcileTombstoneWithRemote(answeredElsewhere({ resolved_at: ANSWERED_AT }))).toBe(
        'restored',
      );
    });
  });

  // Tombstones from before SQLite migration 021 have no copy recorded: read
  // as "deleted open", so they never remove an answer.
  describe('a tombstone from before migration 021', () => {
    async function legacyTombstone(deletedStatus: string | null = null) {
      await getDb().run(
        `INSERT INTO prediction_deletions (id, user_id, deleted_at, pushed_at, counted, deleted_status, deleted_resolved_at)
           VALUES ('p1', 'u1', '2099-06-01T00:00:00.000Z', NULL, 1, ?, NULL)`,
        [deletedStatus],
      );
    }

    it('restores any answer, before the deletion or after, and keeps it against an open copy', async () => {
      await legacyTombstone();
      expect(
        await reconcileTombstoneWithRemote(answeredElsewhere({ status: 'pending', resolved_at: null })),
      ).toBe('kept');
      expect(await reconcileTombstoneWithRemote(answeredElsewhere({ resolved_at: BEFORE }))).toBe(
        'restored',
      );
      expect(await getPrediction('p1')).toMatchObject({ status: 'resolved_no', resolved_at: BEFORE });
      expect(await listDeletions('u1')).toEqual([]);
    });

    it('reads a value that is not a status as no copy at all', async () => {
      await legacyTombstone('resolved_maybe');
      expect(await reconcileTombstoneWithRemote(answeredElsewhere())).toBe('restored');
    });
  });

  it('keeps the tombstone for a pulled row whose status is no status at all', async () => {
    await deletedHere();
    const odd = answeredElsewhere({ status: 'archived' as PredictionWireRow['status'] });
    expect(await reconcileTombstoneWithRemote(odd)).toBe('kept');
    expect(await isDeletedHere('p1')).toBe(true);
  });

  it("keeps another account's tombstone, and says none when there is no tombstone", async () => {
    await deletedHere({ userId: 'u2' });
    expect(await reconcileTombstoneWithRemote(answeredElsewhere())).toBe('kept');
    expect(await listDeletions('u2')).toHaveLength(1);
    expect(await getPrediction('p1')).toBeNull();

    expect(await reconcileTombstoneWithRemote(answeredElsewhere({ id: 'never-deleted' }))).toBe('none');
    expect(await getPrediction('never-deleted')).toBeNull();
  });

  it('drops nothing when the write fails: one transaction', async () => {
    await deletedHere();
    const db = getDb();
    const realRun = db.run.bind(db);
    db.run = async (sql, params) => {
      if (/INSERT INTO predictions/.test(sql)) throw new Error('forced failure');
      return realRun(sql, params);
    };
    try {
      await expect(reconcileTombstoneWithRemote(answeredElsewhere())).rejects.toThrow('forced failure');
    } finally {
      db.run = realRun;
    }
    expect(await isDeletedHere('p1')).toBe(true);
    expect(await listDeletions('u1')).toEqual([expect.objectContaining({ id: 'p1', counted: true })]);
    expect(await getPrediction('p1')).toBeNull();
  });
});

// Review round 6: what a deletion push needs to leave an answer given after
// the delete alone on the server.
describe('listPendingTombstonesSettled', () => {
  it("lists this user's deletions not yet pushed with their times, oldest first", async () => {
    await insertPrediction(samplePrediction({ id: 'a' }));
    await insertPrediction(samplePrediction({ id: 'b' }));
    await insertPrediction(samplePrediction({ id: 'pushed' }));
    await insertPrediction(samplePrediction({ id: 'theirs', user_id: 'u2' }));
    await deletePrediction('a');
    await deletePrediction('b', { counted: true });
    await deletePrediction('pushed');
    await markDeletionPushed('pushed');
    await deletePrediction('theirs');
    const listed = await listPendingTombstonesSettled('u1');
    expect(listed.map((t) => t.id)).toEqual(['a', 'b']);
    const all = await listDeletions('u1');
    for (const t of listed) {
      expect(t.deleted_at).toBe(all.find((d) => d.id === t.id)?.deleted_at);
    }
    expect(listed.map((t) => t.id)).toEqual(await listPendingDeletions('u1'));
    expect((await listPendingTombstonesSettled('u2')).map((t) => t.id)).toEqual(['theirs']);
  });

  it('never lists a deletion whose transaction rolled back', async () => {
    await insertPrediction(samplePrediction({ id: 'a' }));
    await expect(
      withTransaction(async () => {
        await deletePrediction('a');
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');
    expect(await listPendingTombstonesSettled('u1')).toEqual([]);
  });

  // Review round 7 (SQLite migration 021): what each deletion deleted.
  it('lists what each deletion deleted: the copy as this phone held it', async () => {
    await insertPrediction(samplePrediction({ id: 'open' }));
    await insertPrediction(
      samplePrediction({ id: 'no', status: 'resolved_no', resolved_at: '2026-05-30T19:00:00.000Z' }),
    );
    await insertPrediction(
      samplePrediction({ id: 'skip', status: 'skipped', resolved_at: '2026-06-02T19:00:00.000Z' }),
    );
    await deletePrediction('open');
    await deletePrediction('no', { counted: true });
    await deletePrediction('skip');
    const byId = Object.fromEntries((await listPendingTombstonesSettled('u1')).map((t) => [t.id, t]));
    expect(byId.open).toEqual({
      id: 'open',
      deleted_at: expect.any(String),
      deleted_status: 'pending',
      deleted_resolved_at: null,
    });
    expect(byId.no).toMatchObject({ deleted_status: 'resolved_no', deleted_resolved_at: '2026-05-30T19:00:00.000Z' });
    expect(byId.skip).toMatchObject({ deleted_status: 'skipped', deleted_resolved_at: '2026-06-02T19:00:00.000Z' });
  });

  it('records the copy the caller saw, not the row a pull wrote since', async () => {
    await insertPrediction(samplePrediction());
    const seen = await getPrediction('p1');
    // Answered on another phone and pulled after the screen was drawn.
    await upsertPredictionFromRemote(
      sampleWire({ id: 'p1', status: 'resolved_no', resolved_at: '2026-05-30T19:00:00.000Z', updated_at: '2099-01-01T00:00:00.000Z' }),
    );
    await deletePrediction('p1', { counted: true, seen: seen! });
    expect(await listPendingTombstonesSettled('u1')).toEqual([
      expect.objectContaining({ id: 'p1', deleted_status: 'pending', deleted_resolved_at: null }),
    ]);
  });

  it('records a status that is no status as none, and lists a tombstone from before 021 with none', async () => {
    await insertPrediction(samplePrediction({ id: 'odd' }));
    await deletePrediction('odd', {
      seen: { status: 'archived' as Prediction['status'], resolved_at: 42 as unknown as string },
    });
    await getDb().run(
      `INSERT INTO prediction_deletions (id, user_id, deleted_at, pushed_at, counted)
         VALUES ('legacy', 'u1', '2026-06-01T00:00:00.000Z', NULL, 0)`,
    );
    const byId = Object.fromEntries((await listPendingTombstonesSettled('u1')).map((t) => [t.id, t]));
    expect(byId.odd).toMatchObject({ deleted_status: null, deleted_resolved_at: null });
    expect(byId.legacy).toMatchObject({ deleted_status: null, deleted_resolved_at: null });
  });
});

// Review round 7: the one rule a deletion's push and pull share.
describe('tombstoneCovers', () => {
  const T = '2026-11-17T19:00:00.000Z';
  const tomb = (deleted_status: PendingTombstone['deleted_status'], deleted_resolved_at: string | null = null) => ({
    deleted_status,
    deleted_resolved_at,
  });
  const remote = (status: PredictionWireRow['status'], resolved_at: string | null = null) => ({
    status,
    resolved_at,
  });

  it('covers an open server copy, whatever this phone deleted', () => {
    for (const t of [tomb('pending'), tomb(null), tomb('resolved_yes', T), tomb('skipped', T)]) {
      expect(tombstoneCovers(t, remote('pending'))).toBe(true);
    }
  });

  it('covers only the very answer this phone deleted', () => {
    expect(tombstoneCovers(tomb('resolved_yes', T), remote('resolved_yes', T))).toBe(true);
    expect(tombstoneCovers(tomb('resolved_no', T), remote('resolved_no', '2026-11-17T19:00:00.000999+00:00'))).toBe(true);
    expect(tombstoneCovers(tomb('skipped', T), remote('skipped', '2026-11-17T20:00:00+01:00'))).toBe(true);
    expect(tombstoneCovers(tomb('resolved_yes', T), remote('resolved_no', T))).toBe(false);
    expect(tombstoneCovers(tomb('skipped', T), remote('resolved_yes', T))).toBe(false);
    expect(tombstoneCovers(tomb('resolved_yes', T), remote('resolved_yes', '2026-11-17T19:00:00.001Z'))).toBe(false);
  });

  it('never covers an answer when it deleted an open copy or has no copy recorded', () => {
    for (const status of ['resolved_yes', 'resolved_no', 'skipped'] as const) {
      expect(tombstoneCovers(tomb('pending'), remote(status, T))).toBe(false);
      expect(tombstoneCovers(tomb(null), remote(status, T))).toBe(false);
      expect(tombstoneCovers(tomb(null, T), remote(status, T))).toBe(false);
    }
  });

  it("never covers an answer when a time can't be read on either side", () => {
    expect(tombstoneCovers(tomb('resolved_yes', null), remote('resolved_yes', null))).toBe(false);
    expect(tombstoneCovers(tomb('resolved_yes', 'soon'), remote('resolved_yes', 'soon'))).toBe(false);
    expect(tombstoneCovers(tomb('resolved_yes', T), remote('resolved_yes', null))).toBe(false);
    expect(tombstoneCovers(tomb('resolved_yes', null), remote('resolved_yes', T))).toBe(false);
  });
});

// Review round 7 (the record auditor's two-phone sequence). The server is a
// map; its delete applies `tombstoneCovers`, the filter sync's push must send
// (the services side builds the PostgREST form), and a delete that removes
// nothing reads the row back and reconciles it, as sync does.
describe('a deletion across two phones', () => {
  const DUE = '2099-06-10T12:00:00.000Z';
  const B_ANSWERED = '2099-06-08T19:00:00.000Z'; // two days before the due day

  async function pushDeletionsTo(server: Map<string, PredictionWireRow>): Promise<void> {
    for (const tomb of await listPendingTombstonesSettled('u1')) {
      const row = server.get(tomb.id);
      if (!row) {
        await markDeletionPushed(tomb.id);
      } else if (tombstoneCovers(tomb, row)) {
        server.delete(tomb.id);
        await markDeletionPushed(tomb.id);
      } else {
        await reconcileTombstoneWithRemote(row);
      }
    }
  }

  const onServer = (over: Partial<PredictionWireRow>): PredictionWireRow =>
    sampleWire({ id: 'p1', title: 'Ship the prototype', category: 'work', due_date: DUE, ...over });

  it('B answers No two days before due; A, not pulled, deletes its open copy later: the answer survives and A restores it', async () => {
    // A holds its open copy, synced.
    await insertPrediction(samplePrediction({ due_date: DUE }));
    await markPredictionSynced('p1', (await getRawRow('p1'))!.updated_at);
    // B answered No; A hasn't pulled.
    const server = new Map([
      ['p1', onServer({ status: 'resolved_no', resolved_at: B_ANSWERED, updated_at: B_ANSWERED })],
    ]);
    // A deletes later (its clock is now, after B's answer), counted.
    await deletePrediction('p1', { counted: true });
    expect(await listPendingTombstonesSettled('u1')).toEqual([
      expect.objectContaining({ deleted_status: 'pending', deleted_resolved_at: null }),
    ]);

    await pushDeletionsTo(server);

    expect(server.get('p1')).toMatchObject({ status: 'resolved_no', resolved_at: B_ANSWERED });
    expect(await getPrediction('p1')).toMatchObject({ status: 'resolved_no', resolved_at: B_ANSWERED });
    expect(await listDeletions('u1')).toEqual([]);
    expect(await countUnsynced('u1')).toBe(0);
  });

  it('the same on a pull before the push: restored, and nothing left to push', async () => {
    await insertPrediction(samplePrediction({ due_date: DUE }));
    await deletePrediction('p1', { counted: true });
    const answered = onServer({ status: 'resolved_no', resolved_at: B_ANSWERED, updated_at: B_ANSWERED });
    expect(await reconcileTombstoneWithRemote(answered)).toBe('restored');
    expect(await listPendingTombstonesSettled('u1')).toEqual([]);
    expect((await getPrediction('p1'))?.status).toBe('resolved_no');
  });

  it('a deliberate delete of an answer this phone saw still deletes it on the server, counted', async () => {
    await insertPrediction(samplePrediction({ due_date: DUE, status: 'resolved_yes', resolved_at: B_ANSWERED }));
    const server = new Map([
      // The server wrote the time its own way.
      ['p1', onServer({ status: 'resolved_yes', resolved_at: '2099-06-08T19:00:00+00:00', updated_at: B_ANSWERED })],
    ]);
    await deletePrediction('p1', { counted: true });

    await pushDeletionsTo(server);

    expect(server.has('p1')).toBe(false);
    expect(await getPrediction('p1')).toBeNull();
    expect(await listPendingTombstonesSettled('u1')).toEqual([]);
    expect(await listDeletions('u1')).toEqual([expect.objectContaining({ id: 'p1', counted: true })]);
    // A later pull has nothing to bring back.
    expect(await isDeletedHere('p1')).toBe(true);
  });

  it('an answer switched on the other phone after this one deleted its copy stays, and comes back', async () => {
    await insertPrediction(samplePrediction({ due_date: DUE, status: 'resolved_yes', resolved_at: B_ANSWERED }));
    const server = new Map([
      ['p1', onServer({ status: 'resolved_no', resolved_at: B_ANSWERED, updated_at: '2099-06-08T20:00:00.000Z' })],
    ]);
    await deletePrediction('p1', { counted: true });

    await pushDeletionsTo(server);

    expect(server.get('p1')?.status).toBe('resolved_no');
    expect(await getPrediction('p1')).toMatchObject({ status: 'resolved_no' });
    expect(await listDeletions('u1')).toEqual([]);
  });

  it('an open copy on the server is deleted, whatever this phone deleted', async () => {
    await insertPrediction(samplePrediction({ due_date: DUE, status: 'resolved_no', resolved_at: B_ANSWERED }));
    // This phone's answer never reached the server.
    const server = new Map([['p1', onServer({ status: 'pending', resolved_at: null })]]);
    await deletePrediction('p1', { counted: true });
    await pushDeletionsTo(server);
    expect(server.has('p1')).toBe(false);
    expect(await listDeletions('u1')).toEqual([expect.objectContaining({ id: 'p1', counted: true })]);
  });
});
