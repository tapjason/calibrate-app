// Item 9 (review round 5): the push reads what is dirty once every queued
// transaction has settled. On the one connection an unqueued read runs
// between a transaction's statements and sees its uncommitted writes; pushed,
// a write that then rolled back would sit on the server, and the next pull
// would bring it back.

import type { SupabaseClient } from '@supabase/supabase-js';

import { setDbForTests, withTransaction } from '@/db/client';
import {
  countUnsynced,
  deletePrediction,
  getPrediction,
  insertPrediction,
} from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import type { Prediction, PredictionWireRow } from '@/types';

import { __resetSyncStateForTests, pushDeletions, pushDirty } from './sync';

const USER = 'user-aaa';

const prediction = (id: string): Prediction => ({
  id,
  user_id: USER,
  title: 'Ship it',
  category: 'work',
  confidence: 60,
  created_at: '2026-05-01T00:00:00.000Z',
  due_date: '2026-06-01T00:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
});

function fakeClient() {
  const upserts: PredictionWireRow[][] = [];
  const deletes: string[] = [];
  const from = () => ({
    upsert(rows: PredictionWireRow[]) {
      upserts.push(rows);
      return Promise.resolve({ error: null });
    },
    delete() {
      // Round 6 (item 6): conditional, sent by `.select('id')`, answering
      // with what it removed. Was: sent at the second eq.
      const filters: Record<string, unknown> = {};
      const q = {
        eq(col: string, val: unknown) {
          filters[col] = val;
          return q;
        },
        or: () => q,
        select: () => {
          deletes.push(String(filters.id));
          return Promise.resolve({ data: [{ id: filters.id }], error: null });
        },
      };
      return q;
    },
  });
  return { client: { from } as unknown as SupabaseClient, upserts, deletes };
}

/** A transaction that writes, then waits for `release`, then rolls back or commits. */
function openTransaction(write: () => Promise<void>, outcome: 'rollback' | 'commit') {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let wrote: () => void = () => {};
  const written = new Promise<void>((r) => (wrote = r));
  const done = (async () => {
    try {
      await withTransaction(async () => {
        await write();
        wrote();
        await gate;
        if (outcome === 'rollback') throw new Error('rolled back');
      });
    } catch {
      // The rollback the test asked for.
    }
  })();
  return { written, release: () => release(), done };
}

const ticks = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

beforeEach(async () => {
  setDbForTests(await createTestDb());
  __resetSyncStateForTests();
});

afterEach(() => {
  setDbForTests(null);
  __resetSyncStateForTests();
});

describe('a push started while a transaction is open', () => {
  it("doesn't send the transaction's rows, and sends nothing of one that rolls back", async () => {
    const tx = openTransaction(() => insertPrediction(prediction('in-tx')), 'rollback');
    await tx.written;
    const { client, upserts } = fakeClient();

    const pushing = pushDirty(USER, client, async () => true);
    await ticks();
    // Waiting behind the transaction: nothing read, nothing sent.
    expect(upserts).toEqual([]);

    tx.release();
    await tx.done;
    await expect(pushing).resolves.toBe(0);
    expect(upserts).toEqual([]);
    expect(await getPrediction('in-tx')).toBeNull();
  });

  it('sends a committed row once the transaction has settled', async () => {
    const tx = openTransaction(() => insertPrediction(prediction('in-tx')), 'commit');
    await tx.written;
    const { client, upserts } = fakeClient();

    const pushing = pushDirty(USER, client, async () => true);
    await ticks();
    expect(upserts).toEqual([]);

    tx.release();
    await tx.done;
    await expect(pushing).resolves.toBe(1);
    expect(upserts.flat().map((r) => r.id)).toEqual(['in-tx']);
    expect(await countUnsynced(USER)).toBe(0);
  });

  it('never sends a deletion that rolls back', async () => {
    await insertPrediction(prediction('kept'));
    const tx = openTransaction(async () => {
      await deletePrediction('kept');
    }, 'rollback');
    await tx.written;
    const { client, deletes } = fakeClient();

    const pushing = pushDeletions(USER, client, async () => true);
    await ticks();
    expect(deletes).toEqual([]);

    tx.release();
    await tx.done;
    await expect(pushing).resolves.toBe(0);
    expect(deletes).toEqual([]);
    expect(await getPrediction('kept')).not.toBeNull();
  });
});
