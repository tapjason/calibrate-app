import type { Prediction } from '@/types';

import { getDb, setDbForTests } from './client';
import {
  countRefiles,
  deletePrediction,
  getPrediction,
  insertPrediction,
  listPendingPredictions,
  listResolvedPredictions,
  noteRefile,
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
  it('counts a move once, however many categories it passes through', async () => {
    await noteRefile('p1', 'u1', 'work', 'health');
    expect(await countRefiles('u1')).toBe(1);
    await noteRefile('p1', 'u1', 'health', 'finance');
    expect(await countRefiles('u1')).toBe(1);
    await noteRefile('p2', 'u1', 'work', 'social');
    expect(await countRefiles('u1')).toBe(2);
    expect(await countRefiles('someone-else')).toBe(0);
  });

  it('takes a move back to where it started off the count', async () => {
    await noteRefile('p1', 'u1', 'work', 'health');
    await noteRefile('p1', 'u1', 'health', 'finance');
    await noteRefile('p1', 'u1', 'finance', 'work');
    expect(await countRefiles('u1')).toBe(0);
    // And it can be counted again after that.
    await noteRefile('p1', 'u1', 'work', 'health');
    expect(await countRefiles('u1')).toBe(1);
  });

  it('writes nothing for a move to the same category', async () => {
    await noteRefile('p1', 'u1', 'work', 'work');
    expect(await countRefiles('u1')).toBe(0);
  });

  it('drops the row when the prediction is deleted: that is counted as a deletion', async () => {
    await insertPrediction(samplePrediction());
    await noteRefile('p1', 'u1', 'work', 'health');
    await deletePrediction('p1', { counted: true });
    expect(await countRefiles('u1')).toBe(0);
  });
});
