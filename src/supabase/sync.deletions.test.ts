// Roadmap D25: a deleted prediction is deleted on the server too, and never
// comes back from it.

import type { SupabaseClient } from '@supabase/supabase-js';

import { wipeLocalUserData } from '@/db/account';
import { setDbForTests } from '@/db/client';
import {
  deletePrediction,
  getPrediction,
  insertPrediction,
  isDeletedHere,
  listDeletions,
  listPendingDeletions,
} from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import type { Prediction, PredictionWireRow } from '@/types';

import { __resetSyncStateForTests, pullRemote, pushDeletions, syncNow, type CursorStore } from './sync';

const USER = 'user-aaa';

const prediction = (overrides: Partial<Prediction> = {}): Prediction => ({
  id: 'p1',
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
  ...overrides,
});

const wire = (overrides: Partial<PredictionWireRow> = {}): PredictionWireRow => ({
  ...prediction(),
  updated_at: '2026-05-20T12:00:00.000Z',
  ...overrides,
});

function cursorStore(): CursorStore & { storage: Map<string, string> } {
  const storage = new Map<string, string>();
  return {
    storage,
    async get(userId) {
      return storage.get(userId) ?? null;
    },
    async set(userId, cursor) {
      storage.set(userId, cursor);
    },
  };
}

/** Records every server call in order; deletes fail for ids in `failDelete`. */
function fakeClient(opts: { rows?: PredictionWireRow[]; failDelete?: string[] } = {}) {
  const calls: string[] = [];
  const deleted: string[] = [];
  const from = () => ({
    delete() {
      const filters: Record<string, unknown> = {};
      const q = {
        eq(col: string, val: unknown) {
          filters[col] = val;
          if ('id' in filters && 'user_id' in filters) {
            const id = filters.id as string;
            calls.push(`delete:${id}`);
            if (opts.failDelete?.includes(id)) {
              return Promise.resolve({ error: { message: 'nope' } });
            }
            deleted.push(id);
            return Promise.resolve({ error: null });
          }
          return q;
        },
      };
      return q;
    },
    select() {
      calls.push('select');
      const q = {
        eq: () => q,
        gt: () => q,
        order: () => q,
        // Like the server: a row deleted there isn't returned.
        limit: () =>
          Promise.resolve({
            data: (opts.rows ?? []).filter((r) => !deleted.includes(r.id)),
            error: null,
          }),
      };
      return q;
    },
    upsert() {
      calls.push('upsert');
      return Promise.resolve({ error: null });
    },
  });
  // The client holds USER's session: a sweep checks it before each request.
  const auth = {
    getSession: async () => ({ data: { session: { user: { id: USER } } }, error: null }),
  };
  return { client: { from, auth } as unknown as SupabaseClient, calls, deleted };
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  __resetSyncStateForTests();
});

afterEach(() => {
  setDbForTests(null);
  __resetSyncStateForTests();
});

describe('deletePrediction', () => {
  it('removes the row and leaves a tombstone for its owner', async () => {
    await insertPrediction(prediction());
    await deletePrediction('p1');
    expect(await getPrediction('p1')).toBeNull();
    expect(await listPendingDeletions(USER)).toEqual(['p1']);
    expect(await isDeletedHere('p1')).toBe(true);
  });

  it('does nothing for an id that is not there', async () => {
    await deletePrediction('nope');
    expect(await listPendingDeletions(USER)).toEqual([]);
  });
});

describe('pushDeletions', () => {
  it('deletes on the server, then marks the tombstone pushed and keeps it (D45)', async () => {
    await insertPrediction(prediction());
    await deletePrediction('p1', { counted: true });
    const { client, deleted } = fakeClient();
    expect(await pushDeletions(USER, client)).toBe(1);
    expect(deleted).toEqual(['p1']);
    expect(await listPendingDeletions(USER)).toEqual([]);
    // Still skipped on pull, and still counted.
    expect(await isDeletedHere('p1')).toBe(true);
    const kept = await listDeletions(USER);
    expect(kept).toHaveLength(1);
    expect(kept[0].counted).toBe(true);
    expect(kept[0].pushed_at).not.toBeNull();
    // A second sweep has nothing left to push.
    expect(await pushDeletions(USER, client)).toBe(0);
  });

  // Security review, 2026-11-18: a sweep started for one account sends
  // nothing once the phone holds another's session.
  it('stops at the delete where the account changed', async () => {
    await insertPrediction(prediction({ id: 'a' }));
    await insertPrediction(prediction({ id: 'b' }));
    await deletePrediction('a');
    await deletePrediction('b');
    const { client, deleted } = fakeClient();
    const checks = [true, false];
    expect(await pushDeletions(USER, client, async () => checks.shift() ?? false)).toBe(1);
    expect(deleted).toHaveLength(1);
    expect(await listPendingDeletions(USER)).toHaveLength(1);
  });

  it("deletes nothing by default when the client's session is someone else's", async () => {
    await insertPrediction(prediction());
    await deletePrediction('p1');
    const { client, deleted } = fakeClient();
    (client as unknown as { auth: unknown }).auth = {
      getSession: async () => ({ data: { session: { user: { id: 'user-bbb' } } }, error: null }),
    };
    expect(await pushDeletions(USER, client)).toBe(0);
    expect(deleted).toEqual([]);
    expect(await listPendingDeletions(USER)).toEqual(['p1']);
  });

  it('keeps a tombstone whose delete failed, for the next sweep', async () => {
    await insertPrediction(prediction({ id: 'a' }));
    await insertPrediction(prediction({ id: 'b' }));
    await deletePrediction('a');
    await deletePrediction('b');
    const { client } = fakeClient({ failDelete: ['a'] });
    expect(await pushDeletions(USER, client)).toBe(1);
    expect(await listPendingDeletions(USER)).toEqual(['a']);
  });
});

describe('pullRemote with a pending deletion', () => {
  it('does not bring a deleted prediction back, and still moves the cursor', async () => {
    await insertPrediction(prediction());
    await deletePrediction('p1');
    const store = cursorStore();
    const { client } = fakeClient({ rows: [wire({ updated_at: '2026-05-21T00:00:00.000Z' })] });
    expect(await pullRemote(USER, client, store)).toBe(0);
    expect(await getPrediction('p1')).toBeNull();
    expect(store.storage.get(USER)).toBe('2026-05-21T00:00:00.000Z');
  });
});

describe('syncNow', () => {
  it('pushes deletions before it pulls', async () => {
    await insertPrediction(prediction());
    await deletePrediction('p1');
    const { client, calls } = fakeClient({ rows: [wire()] });
    await syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} });
    expect(calls.indexOf('delete:p1')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('delete:p1')).toBeLessThan(calls.indexOf('select'));
    expect(await getPrediction('p1')).toBeNull();
  });
});

describe('syncNow with a failed delete', () => {
  it('keeps the prediction gone while the server still has it', async () => {
    await insertPrediction(prediction());
    await deletePrediction('p1');
    const { client } = fakeClient({ rows: [wire()], failDelete: ['p1'] });
    await syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} });
    expect(await getPrediction('p1')).toBeNull();
    expect(await listPendingDeletions(USER)).toEqual(['p1']);
  });
});

describe('wipeLocalUserData', () => {
  it('clears the tombstones with the rows', async () => {
    await insertPrediction(prediction());
    await deletePrediction('p1');
    await wipeLocalUserData(USER);
    expect(await listPendingDeletions(USER)).toEqual([]);
  });
});
