import type { Prediction } from '@/types';

import { getDb, setDbForTests } from './client';
import {
  countPostponements,
  countRefiles,
  deletePrediction,
  getPrediction,
  insertPrediction,
  listPendingPredictions,
  listResolvedPredictions,
  noteRefile,
  recordPostponement,
  refilePrediction,
  resolvePrediction,
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

beforeEach(async () => {
  setDbForTests(await createTestDb());
});

afterEach(() => {
  setDbForTests(null);
});

describe('predictions db', () => {
  it('round-trips an inserted prediction', async () => {
    const p = samplePrediction({ integrity_bonus: true, confidence: 50 });
    await insertPrediction(p);
    expect(await getPrediction(p.id)).toEqual(p);
  });

  it('returns null for a missing id', async () => {
    expect(await getPrediction('nope')).toBeNull();
  });

  it('lists only this user\'s pending predictions, ordered by due_date', async () => {
    await insertPrediction(samplePrediction({ id: 'a', due_date: '2026-06-02T00:00:00.000Z' }));
    await insertPrediction(samplePrediction({ id: 'b', due_date: '2026-06-01T00:00:00.000Z' }));
    await insertPrediction(
      samplePrediction({
        id: 'c',
        status: 'resolved_yes',
        resolved_at: '2026-05-15T00:00:00.000Z',
      }),
    );
    await insertPrediction(samplePrediction({ id: 'd', user_id: 'u2' }));

    const pending = await listPendingPredictions('u1');
    expect(pending.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('resolvePrediction updates status, resolved_at, and reflection', async () => {
    const p = samplePrediction();
    await insertPrediction(p);
    await resolvePrediction(p.id, 'resolved_yes', 'shipped on time');

    const got = await getPrediction(p.id);
    expect(got?.status).toBe('resolved_yes');
    expect(got?.reflection).toBe('shipped on time');
    expect(got?.resolved_at).not.toBeNull();
  });

  it('listResolvedPredictions excludes pending', async () => {
    await insertPrediction(samplePrediction({ id: 'a' }));
    await insertPrediction(samplePrediction({ id: 'b' }));
    await resolvePrediction('b', 'resolved_no');

    const resolved = await listResolvedPredictions('u1');
    expect(resolved.map((p) => p.id)).toEqual(['b']);
  });

  it('deletePrediction removes the row', async () => {
    const p = samplePrediction();
    await insertPrediction(p);
    await deletePrediction(p.id);
    expect(await getPrediction(p.id)).toBeNull();
  });
});

describe('db transactions', () => {
  it('commits all writes when the callback resolves', async () => {
    await getDb().transaction(async () => {
      await insertPrediction(samplePrediction({ id: 'tx1' }));
      await insertPrediction(samplePrediction({ id: 'tx2' }));
    });
    expect(await getPrediction('tx1')).not.toBeNull();
    expect(await getPrediction('tx2')).not.toBeNull();
  });

  it('rolls back every write when the callback throws', async () => {
    await expect(
      getDb().transaction(async () => {
        await insertPrediction(samplePrediction({ id: 'tx3' }));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await getPrediction('tx3')).toBeNull();
  });
});

// Step 184 (D65): answers left in another category than they were answered in.
describe('prediction_refiles', () => {
  /** An answered prediction, filed under `category`. */
  const answered = (id: string, category: Prediction['category'] = 'work') =>
    insertPrediction(
      samplePrediction({
        id,
        category,
        status: 'resolved_no',
        resolved_at: '2026-06-01T20:00:00.000Z',
      }),
    );
  /** What the store does: the move, then the note beside it. */
  const move = async (id: string, from: Prediction['category'], to: Prediction['category']) => {
    await refilePrediction(id, to);
    await noteRefile(id, 'u1', from, to);
  };

  it('counts a move once, however many categories it passes through', async () => {
    await answered('p1');
    await answered('p2');
    await move('p1', 'work', 'health');
    expect(await countRefiles('u1')).toBe(1);
    await move('p1', 'health', 'finance');
    expect(await countRefiles('u1')).toBe(1);
    await move('p2', 'work', 'social');
    expect(await countRefiles('u1')).toBe(2);
    expect(await countRefiles('someone-else')).toBe(0);
  });

  it('takes a move back to where it started off the count', async () => {
    await answered('p1');
    await move('p1', 'work', 'health');
    await move('p1', 'health', 'finance');
    await move('p1', 'finance', 'work');
    expect(await countRefiles('u1')).toBe(0);
    // And it can be counted again after that.
    await move('p1', 'work', 'health');
    expect(await countRefiles('u1')).toBe(1);
  });

  it('writes nothing for a move to the same category', async () => {
    await answered('p1');
    await move('p1', 'work', 'work');
    expect(await countRefiles('u1')).toBe(0);
  });

  it('drops the row when the prediction is deleted: that is counted as a deletion', async () => {
    await answered('p1');
    await move('p1', 'work', 'health');
    expect(await countRefiles('u1')).toBe(1);
    await deletePrediction('p1', { counted: true });
    expect(await countRefiles('u1')).toBe(0);
  });

  // Code review 2026-11-18: deleted between the store's check and its
  // transaction, the move changes no row and the delete already counted it.
  it('notes nothing when the move changed no row, so a deleted answer is counted once', async () => {
    await answered('p1');
    await deletePrediction('p1', { counted: true });

    await move('p1', 'work', 'health');

    expect(await countRefiles('u1')).toBe(0);
    const deletions = await getDb().all<{ id: string; counted: number }>(
      `SELECT id, counted FROM prediction_deletions WHERE user_id = ?`,
      ['u1'],
    );
    expect(deletions).toEqual([{ id: 'p1', counted: 1 }]);
  });

  it('notes nothing for a prediction that is not an answer, or not this user’s', async () => {
    // Open: refilePrediction leaves it where it was.
    await insertPrediction(samplePrediction({ id: 'open' }));
    await move('open', 'work', 'health');
    // A "Can't tell": never scored, and refilePrediction leaves it too.
    await insertPrediction(
      samplePrediction({ id: 'skip', status: 'skipped', resolved_at: '2026-06-01T20:00:00.000Z' }),
    );
    await move('skip', 'work', 'health');
    // Another user's answer, even once it sits under the new category.
    await insertPrediction(
      samplePrediction({
        id: 'theirs',
        user_id: 'u2',
        category: 'health',
        status: 'resolved_yes',
        resolved_at: '2026-06-01T20:00:00.000Z',
      }),
    );
    await noteRefile('theirs', 'u1', 'work', 'health');

    expect(await countRefiles('u1')).toBe(0);
    expect(await countRefiles('u2')).toBe(0);
  });

  it('leaves an existing note alone when a later move changed no row', async () => {
    await answered('p1');
    await move('p1', 'work', 'health');
    // The answer stops being one behind the store's back (a sync, say): a
    // move back or onward now lands nowhere, and the note stays as it was.
    await getDb().run(`UPDATE predictions SET status = 'skipped' WHERE id = 'p1'`);
    await move('p1', 'health', 'work');
    await move('p1', 'health', 'finance');
    const note = await getDb().get<{ from_category: string; to_category: string }>(
      `SELECT from_category, to_category FROM prediction_refiles WHERE prediction_id = 'p1'`,
    );
    expect(note).toEqual({ from_category: 'work', to_category: 'health' });
  });
});

// Late changes to an open prediction (step 173, D62, 2026-11-19): counted
// once per prediction, kept after a delete, and only for an edit that landed.
describe('prediction_postponements', () => {
  const DUE = '2026-06-01T00:00:00.000Z';

  it('counts a prediction once, whatever changed and however often', async () => {
    await insertPrediction(samplePrediction());
    await recordPostponement('p1', 'u1', DUE, '2026-06-05T00:00:00.000Z');
    await recordPostponement('p1', 'u1', DUE, DUE);
    expect(await countPostponements('u1')).toBe(1);
    await deletePrediction('p1');
    expect(await countPostponements('u1')).toBe(1);
  });

  // Code review round 5: the store decides from a read taken before its
  // transaction; an answer pulled in between leaves the edit unwritten.
  it('notes nothing for a prediction no longer open, or not this user’s', async () => {
    await insertPrediction(samplePrediction({ id: 'answered' }));
    await resolvePrediction('answered', 'resolved_no');
    await recordPostponement('answered', 'u1', DUE, DUE);
    await insertPrediction(samplePrediction({ id: 'theirs', user_id: 'u2' }));
    await recordPostponement('theirs', 'u1', DUE, DUE);
    await recordPostponement('missing', 'u1', DUE, DUE);
    expect(await countPostponements('u1')).toBe(0);
    expect(await countPostponements('u2')).toBe(0);
  });
});
