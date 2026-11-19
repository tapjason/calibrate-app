import type { Prediction } from '@/types';

import { getDb, setDbForTests } from './client';
import {
  countPostponements,
  countRefiles,
  deletePrediction,
  getCategoryOrigin,
  getPrediction,
  insertPrediction,
  listCategoryOrigins,
  listPendingPredictions,
  listResolvedPredictions,
  noteAnswerAwayFromOrigin,
  noteRefile,
  recordPostponement,
  refilePrediction,
  rememberCategoryOrigin,
  resolvePrediction,
  updatePrediction,
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

// Review round 6 (widening D69 (e)): the category at the first move after
// the day it was made, and an answer counted against it with the moved
// answers.
describe('prediction_category_origins', () => {
  const AT = '2026-06-02T19:00:00.000Z';
  /** What the store does on Edit: the move, then what is remembered beside it. */
  const moveOpen = async (
    from: Prediction['category'],
    to: Prediction['category'],
    countedLate = false,
    id = 'p1',
  ) => {
    await updatePrediction(id, {
      title: 'Ship the prototype',
      category: to,
      due_date: '2026-06-03T00:00:00.000Z',
    });
    await rememberCategoryOrigin(id, 'u1', from, to, countedLate);
  };

  it('keeps the first category remembered, and only ever raises counted_late', async () => {
    await insertPrediction(samplePrediction());
    await moveOpen('work', 'health');
    await moveOpen('health', 'finance');
    expect(await getCategoryOrigin('p1', 'u1')).toMatchObject({
      from_category: 'work',
      counted_late: false,
    });
    await moveOpen('finance', 'social', true);
    expect(await getCategoryOrigin('p1', 'u1')).toMatchObject({
      from_category: 'work',
      counted_late: true,
    });
    await moveOpen('social', 'work', false);
    expect((await getCategoryOrigin('p1', 'u1'))?.counted_late).toBe(true);
    expect(await listCategoryOrigins('u1')).toHaveLength(1);
  });

  it('remembers nothing for a move that did not land: answered, not this user’s, or another category', async () => {
    await insertPrediction(samplePrediction({ id: 'answered' }));
    await resolvePrediction('answered', 'resolved_no');
    await rememberCategoryOrigin('answered', 'u1', 'work', 'health', false);
    await insertPrediction(samplePrediction({ id: 'theirs', user_id: 'u2', category: 'health' }));
    await rememberCategoryOrigin('theirs', 'u1', 'work', 'health', false);
    await insertPrediction(samplePrediction({ id: 'stayed' }));
    await rememberCategoryOrigin('stayed', 'u1', 'work', 'health', false);
    expect(await listCategoryOrigins('u1')).toEqual([]);
    expect(await listCategoryOrigins('u2')).toEqual([]);
    expect(await getCategoryOrigin('theirs', 'u2')).toBeNull();
  });

  it('counts an answer given elsewhere with the moved answers, once, only the one that landed', async () => {
    await insertPrediction(samplePrediction());
    await moveOpen('work', 'health');
    await resolvePrediction('p1', 'resolved_no', undefined, { at: AT });
    // Another answer time (a resolve that changed nothing) notes nothing.
    await noteAnswerAwayFromOrigin('p1', 'u1', 'work', 'health', '2026-06-02T20:00:00.000Z');
    expect(await countRefiles('u1')).toBe(0);
    await noteAnswerAwayFromOrigin('p1', 'u1', 'work', 'health', AT);
    await noteAnswerAwayFromOrigin('p1', 'u1', 'work', 'health', AT);
    expect(await countRefiles('u1')).toBe(1);
    // And a move back after the answer takes it off, as for D65.
    await refilePrediction('p1', 'work');
    await noteRefile('p1', 'u1', 'health', 'work');
    expect(await countRefiles('u1')).toBe(0);
  });

  it('notes nothing against a wrong or late-counted origin, in the same category, or for a skip', async () => {
    await insertPrediction(samplePrediction());
    await moveOpen('work', 'health', true);
    await resolvePrediction('p1', 'resolved_no', undefined, { at: AT });
    // Counted late already: never twice.
    await noteAnswerAwayFromOrigin('p1', 'u1', 'work', 'health', AT);
    // Not the remembered category.
    await noteAnswerAwayFromOrigin('p1', 'u1', 'finance', 'health', AT);
    // The same category.
    await noteAnswerAwayFromOrigin('p1', 'u1', 'health', 'health', AT);
    await insertPrediction(samplePrediction({ id: 'skip' }));
    await moveOpen('work', 'health', false, 'skip');
    await resolvePrediction('skip', 'skipped', undefined, { at: AT });
    await noteAnswerAwayFromOrigin('skip', 'u1', 'work', 'health', AT);
    expect(await countRefiles('u1')).toBe(0);
  });

  it('forgets the remembered category when the prediction is deleted', async () => {
    await insertPrediction(samplePrediction());
    await moveOpen('work', 'health');
    await deletePrediction('p1', { counted: true });
    expect(await listCategoryOrigins('u1')).toEqual([]);
  });
});
