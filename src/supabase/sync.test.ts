// Sync module tests. The Supabase client is faked end-to-end so these tests
// don't need a network or the real SDK. Each test wires its own fake client +
// in-memory cursor store and asserts on local-DB side effects and on the
// fake client's recorded calls.

import type { SupabaseClient } from '@supabase/supabase-js';

import { setDbForTests } from '@/db/client';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import {
  getPrediction,
  insertPrediction,
  listDirtyPredictions,
  listPendingPredictions,
  upsertPredictionFromRemote,
} from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import type { Prediction, PredictionWireRow } from '@/types';

import {
  CursorStore,
  __resetSyncStateForTests,
  clearSyncCursor,
  pullRemote,
  pushDirty,
  syncNow,
} from './sync';

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const localPrediction = (overrides: Partial<Prediction> = {}): Prediction => ({
  id: 'local-1',
  user_id: 'user-aaa',
  title: 'Local',
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
  id: 'remote-1',
  user_id: 'user-aaa',
  title: 'Remote',
  category: 'health',
  confidence: 70,
  created_at: '2026-05-01T00:00:00.000Z',
  due_date: '2026-06-01T00:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
  updated_at: '2026-05-20T12:00:00.000Z',
  ...overrides,
});

function makeInMemoryCursorStore(): CursorStore & {
  storage: Map<string, string>;
} {
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

interface FakeClient {
  client: SupabaseClient;
  upsertCalls: PredictionWireRow[][];
  selectCalls: Array<{
    eq?: [string, unknown];
    gt?: [string, unknown];
    limit?: number;
  }>;
}

/**
 * Hand-rolled SupabaseClient with just enough chain methods to drive sync.
 * `selectResult` is the response for the read path; `upsertResults` is a
 * sequence of responses for successive upsert calls (use to simulate batch
 * failure followed by per-row success/failure).
 */
function makeFakeClient(opts: {
  selectResult?: { data: unknown[] | null; error: { message: string } | null };
  upsertResults?: Array<{ error: { message: string } | null }>;
} = {}): FakeClient {
  const upsertCalls: PredictionWireRow[][] = [];
  const selectCalls: FakeClient['selectCalls'] = [{}];
  let upsertIdx = 0;

  const select = (): unknown => {
    const q = {
      eq(col: string, val: unknown) {
        selectCalls[selectCalls.length - 1].eq = [col, val];
        return q;
      },
      gt(col: string, val: unknown) {
        selectCalls[selectCalls.length - 1].gt = [col, val];
        return q;
      },
      order() {
        return q;
      },
      limit(n: number) {
        selectCalls[selectCalls.length - 1].limit = n;
        return Promise.resolve(
          opts.selectResult ?? { data: [], error: null },
        );
      },
    };
    return q;
  };

  const upsert = (rows: PredictionWireRow | PredictionWireRow[]) => {
    const arr = Array.isArray(rows) ? rows : [rows];
    upsertCalls.push(arr);
    const result = opts.upsertResults?.[upsertIdx] ?? { error: null };
    upsertIdx += 1;
    return Promise.resolve(result);
  };

  const from = () => {
    if (selectCalls[selectCalls.length - 1].limit !== undefined) {
      // previous call already consumed; start a new entry
      selectCalls.push({});
    }
    return {
      select,
      upsert,
    };
  };

  return {
    client: { from, auth: sessionOf('user-aaa') } as unknown as SupabaseClient,
    upsertCalls,
    selectCalls,
  };
}

/**
 * The client's auth, holding `userId`'s session: a sweep checks it is still
 * the account it started for before each request (security review,
 * 2026-11-18).
 */
function sessionOf(userId: string | null) {
  return {
    getSession: async () => ({
      data: { session: userId ? { user: { id: userId } } : null },
      error: null,
    }),
  };
}

// ----------------------------------------------------------------------------
// Setup
// ----------------------------------------------------------------------------

beforeEach(async () => {
  setDbForTests(await createTestDb());
  __resetSyncStateForTests();
});

afterEach(() => {
  setDbForTests(null);
  __resetSyncStateForTests();
});

// ----------------------------------------------------------------------------
// pullRemote
// ----------------------------------------------------------------------------

describe('pullRemote', () => {
  it('writes a remote row when no local copy exists', async () => {
    const remote = wire({ id: 'r1', updated_at: '2026-05-20T00:00:00.000Z' });
    const { client } = makeFakeClient({
      selectResult: { data: [remote], error: null },
    });
    const cursorStore = makeInMemoryCursorStore();

    const written = await pullRemote('user-aaa', client, cursorStore);
    expect(written).toBe(1);
    expect(cursorStore.storage.get('user-aaa')).toBe('2026-05-20T00:00:00.000Z');
  });

  it('skips a remote row when local is strictly newer', async () => {
    await insertPrediction(localPrediction({ id: 'shared' }));
    // Local was just inserted, so its updated_at is "now" — well after any
    // 2025 remote timestamp.
    const stale = wire({ id: 'shared', updated_at: '2025-01-01T00:00:00.000Z' });

    const { client } = makeFakeClient({
      selectResult: { data: [stale], error: null },
    });
    const cursorStore = makeInMemoryCursorStore();

    const written = await pullRemote('user-aaa', client, cursorStore);
    expect(written).toBe(0);
  });

  // Roadmap D39: a prediction filed under an added category syncs like any
  // other, so a newer server copy wins by the same last-write-wins rule.
  it('writes a newer server copy of a prediction in an added category', async () => {
    await insertPrediction(
      localPrediction({ id: 'added', category: 'c-grad123456', status: 'resolved_yes', resolved_at: '2026-06-01T19:00:00.000Z' }),
    );
    const newer = wire({ id: 'added', category: 'c-grad123456', status: 'resolved_no', resolved_at: '2026-06-01T20:00:00.000Z', updated_at: '2099-01-01T00:00:00.000Z' });
    const { client } = makeFakeClient({ selectResult: { data: [newer], error: null } });
    const written = await pullRemote('user-aaa', client, makeInMemoryCursorStore());
    expect(written).toBe(1);
    expect(await getPrediction('added')).toMatchObject({ category: 'c-grad123456', status: 'resolved_no' });
  });

  it('skips a remote row whose user_id does not match (RLS defense)', async () => {
    const foreign = wire({ id: 'foreign', user_id: 'someone-else' });
    const { client } = makeFakeClient({
      selectResult: { data: [foreign], error: null },
    });
    const cursorStore = makeInMemoryCursorStore();

    const written = await pullRemote('user-aaa', client, cursorStore);
    expect(written).toBe(0);
  });

  it('advances the cursor to the max updated_at seen, even when nothing was written', async () => {
    await insertPrediction(localPrediction({ id: 's1' }));
    const stale = wire({ id: 's1', updated_at: '2025-01-01T00:00:00.000Z' });
    const { client } = makeFakeClient({
      selectResult: { data: [stale], error: null },
    });
    const cursorStore = makeInMemoryCursorStore();

    await pullRemote('user-aaa', client, cursorStore);
    expect(cursorStore.storage.get('user-aaa')).toBe('2025-01-01T00:00:00.000Z');
  });

  it('does not advance the cursor when zero rows came back', async () => {
    const { client } = makeFakeClient({
      selectResult: { data: [], error: null },
    });
    const cursorStore = makeInMemoryCursorStore();

    const written = await pullRemote('user-aaa', client, cursorStore);
    expect(written).toBe(0);
    expect(cursorStore.storage.get('user-aaa')).toBeUndefined();
  });

  it('throws when the remote query returns an error', async () => {
    const { client } = makeFakeClient({
      selectResult: { data: null, error: { message: 'boom' } },
    });
    const cursorStore = makeInMemoryCursorStore();

    await expect(
      pullRemote('user-aaa', client, cursorStore),
    ).rejects.toBeDefined();
  });
});

// ----------------------------------------------------------------------------
// pushDirty
// ----------------------------------------------------------------------------

describe('pushDirty', () => {
  it('returns 0 and skips the request when nothing is dirty', async () => {
    const { client, upsertCalls } = makeFakeClient();
    const pushed = await pushDirty('user-aaa', client);
    expect(pushed).toBe(0);
    expect(upsertCalls).toHaveLength(0);
  });

  it('batch-upserts all dirty rows and marks them clean', async () => {
    await insertPrediction(localPrediction({ id: 'a' }));
    await insertPrediction(localPrediction({ id: 'b' }));
    expect(await listDirtyPredictions('user-aaa')).toHaveLength(2);

    const { client, upsertCalls } = makeFakeClient();
    const pushed = await pushDirty('user-aaa', client);
    expect(pushed).toBe(2);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toHaveLength(2);
    expect(await listDirtyPredictions('user-aaa')).toEqual([]);
  });

  // Roadmap D39: only the category's id goes up; its name stays on the phone.
  it('pushes a prediction filed under an added category with the rest', async () => {
    await insertPrediction(localPrediction({ id: 'built-in' }));
    await insertPrediction(localPrediction({ id: 'added', category: 'c-grad123456' }));

    const { client, upsertCalls } = makeFakeClient();
    const pushed = await pushDirty('user-aaa', client);
    expect(pushed).toBe(2);
    expect(upsertCalls[0].map((r: { id: string }) => r.id).sort()).toEqual(['added', 'built-in']);
    expect(upsertCalls[0].find((r) => r.id === 'added')?.category).toBe('c-grad123456');
    expect(await listDirtyPredictions('user-aaa')).toEqual([]);
  });

  // Roadmap D45: the date a prediction was reworded goes up with the row.
  it('pushes title_edited_at with the row', async () => {
    await insertPrediction(localPrediction({ id: 'reworded', title_edited_at: '2026-05-10T09:00:00.000Z' }));

    const { client, upsertCalls } = makeFakeClient();
    await pushDirty('user-aaa', client);
    expect(upsertCalls[0][0]).toMatchObject({ id: 'reworded', title_edited_at: '2026-05-10T09:00:00.000Z' });
  });

  it('falls back to per-row upsert when the batch fails', async () => {
    await insertPrediction(localPrediction({ id: 'a' }));
    await insertPrediction(localPrediction({ id: 'b' }));

    const { client, upsertCalls } = makeFakeClient({
      upsertResults: [
        { error: { message: 'batch failed' } }, // batch
        { error: null }, // a
        { error: null }, // b
      ],
    });
    const pushed = await pushDirty('user-aaa', client);
    expect(pushed).toBe(2);
    // 1 batch attempt + 2 per-row attempts
    expect(upsertCalls).toHaveLength(3);
    expect(await listDirtyPredictions('user-aaa')).toEqual([]);
  });

  it('per-row fallback marks only the successful rows clean', async () => {
    await insertPrediction(localPrediction({ id: 'good' }));
    await insertPrediction(localPrediction({ id: 'bad' }));

    const { client } = makeFakeClient({
      upsertResults: [
        { error: { message: 'batch failed' } },
        { error: null }, // good
        { error: { message: 'row failed' } }, // bad
      ],
    });
    const pushed = await pushDirty('user-aaa', client);
    expect(pushed).toBe(1);
    const stillDirty = await listDirtyPredictions('user-aaa');
    expect(stillDirty.map((r) => r.id)).toEqual(['bad']);
  });
});

// ----------------------------------------------------------------------------
// syncNow orchestrator
// ----------------------------------------------------------------------------

describe('syncNow', () => {
  it('is a no-op for the guest user', async () => {
    const recompute = jest.fn();
    const result = await syncNow(LOCAL_GUEST_USER_ID, {
      client: makeFakeClient().client,
      cursorStore: makeInMemoryCursorStore(),
      recompute,
    });
    expect(result).toEqual({ pulled: 0, pushed: 0 });
    expect(recompute).not.toHaveBeenCalled();
  });

  it('is a no-op for a null userId', async () => {
    const result = await syncNow(null);
    expect(result).toEqual({ pulled: 0, pushed: 0 });
  });

  it('is a no-op when no client is available', async () => {
    const recompute = jest.fn();
    const result = await syncNow('user-aaa', {
      client: null,
      cursorStore: makeInMemoryCursorStore(),
      recompute,
    });
    expect(result).toEqual({ pulled: 0, pushed: 0 });
    expect(recompute).not.toHaveBeenCalled();
  });

  it('returns merged counts and calls recompute when work happened', async () => {
    await insertPrediction(localPrediction({ id: 'l1' })); // dirty=1
    const remote = wire({ id: 'r1', updated_at: '2026-05-20T00:00:00.000Z' });

    const { client } = makeFakeClient({
      selectResult: { data: [remote], error: null },
    });
    const recompute = jest.fn().mockResolvedValue(undefined);

    const result = await syncNow('user-aaa', {
      client,
      cursorStore: makeInMemoryCursorStore(),
      recompute,
    });

    expect(result).toEqual({ pulled: 1, pushed: 1 });
    expect(recompute).toHaveBeenCalledTimes(1);
    expect(recompute).toHaveBeenCalledWith('user-aaa');
  });

  it('does not call recompute when nothing changed', async () => {
    const { client } = makeFakeClient(); // empty pull, nothing to push
    const recompute = jest.fn();

    const result = await syncNow('user-aaa', {
      client,
      cursorStore: makeInMemoryCursorStore(),
      recompute,
    });
    expect(result).toEqual({ pulled: 0, pushed: 0 });
    expect(recompute).not.toHaveBeenCalled();
  });

  it('swallows pull errors and still attempts push', async () => {
    await insertPrediction(localPrediction({ id: 'l1' }));
    const { client } = makeFakeClient({
      selectResult: { data: null, error: { message: 'pull boom' } },
    });
    const recompute = jest.fn().mockResolvedValue(undefined);

    const result = await syncNow('user-aaa', {
      client,
      cursorStore: makeInMemoryCursorStore(),
      recompute,
    });
    expect(result.pulled).toBe(0);
    expect(result.pushed).toBe(1);
    expect(recompute).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent calls for the same user', async () => {
    await insertPrediction(localPrediction({ id: 'l1' }));
    let resolveSelect: (v: { data: unknown[]; error: null }) => void = () => {};
    const slowSelectPromise = new Promise<{ data: unknown[]; error: null }>(
      (r) => {
        resolveSelect = r;
      },
    );

    const upsertCalls: PredictionWireRow[][] = [];
    const client = {
      auth: sessionOf('user-aaa'),
      from: () => ({
        select: () => ({
          eq: () => ({
            gt: () => ({
              order: () => ({
                limit: () => slowSelectPromise,
              }),
            }),
          }),
        }),
        upsert: (rows: PredictionWireRow | PredictionWireRow[]) => {
          upsertCalls.push(Array.isArray(rows) ? rows : [rows]);
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as SupabaseClient;

    const recompute = jest.fn().mockResolvedValue(undefined);

    const first = syncNow('user-aaa', {
      client,
      cursorStore: makeInMemoryCursorStore(),
      recompute,
    });
    const second = syncNow('user-aaa', {
      client,
      cursorStore: makeInMemoryCursorStore(),
      recompute,
    });
    // Both calls return the SAME promise instance — only one sweep runs.
    expect(first).toBe(second);

    resolveSelect({ data: [], error: null });
    await Promise.all([first, second]);
    expect(upsertCalls).toHaveLength(1);
  });
});

// ----------------------------------------------------------------------------
// Integration: pulled rows surface through the standard list helpers
// ----------------------------------------------------------------------------

describe('sync integration with the predictions table', () => {
  it('a pulled row is visible to listPending afterward', async () => {
    const remote = wire({
      id: 'pulled',
      status: 'pending',
      user_id: 'user-aaa',
      updated_at: '2026-05-20T00:00:00.000Z',
    });
    await upsertPredictionFromRemote(remote);

    const pending = await listPendingPredictions('user-aaa');
    expect(pending.map((p) => p.id)).toContain('pulled');
  });
});

// ----------------------------------------------------------------------------
// Security review, 2026-11-18: a sweep belongs to the account it started for
// ----------------------------------------------------------------------------

describe('a sweep whose account changes mid-way', () => {
  /** The session's user for each check, in order; the last one repeats. */
  function sessionsInTurn(...ids: Array<string | null>) {
    const seen: Array<string | null> = [];
    return {
      seen,
      sessionUserId: jest.fn(async () => {
        const id = ids.length > 1 ? ids.shift()! : ids[0];
        seen.push(id);
        return id;
      }),
    };
  }

  it('sends nothing more once the session is another account', async () => {
    await insertPrediction(localPrediction({ id: 'l1' }));
    const remote = wire({ id: 'r1', updated_at: '2026-05-20T00:00:00.000Z' });
    const { client, upsertCalls, selectCalls } = makeFakeClient({
      selectResult: { data: [remote], error: null },
    });
    const recompute = jest.fn().mockResolvedValue(undefined);
    // user-aaa started it; by the pull, the phone holds user-bbb's session.
    const { sessionUserId } = sessionsInTurn('user-bbb');

    const result = await syncNow('user-aaa', {
      client,
      cursorStore: makeInMemoryCursorStore(),
      recompute,
      sessionUserId,
    });

    expect(result).toEqual({ pulled: 0, pushed: 0 });
    expect(upsertCalls).toHaveLength(0);
    expect(selectCalls[0].limit).toBeUndefined();
    expect(recompute).not.toHaveBeenCalled();
    // Still dirty, for user-aaa's next sweep.
    expect((await listDirtyPredictions('user-aaa')).map((r) => r.id)).toEqual(['l1']);
  });

  it('stops after a sign-out, when the session is gone', async () => {
    await insertPrediction(localPrediction({ id: 'l1' }));
    const { client, upsertCalls } = makeFakeClient();
    const { sessionUserId } = sessionsInTurn('user-aaa', null);

    await syncNow('user-aaa', {
      client,
      cursorStore: makeInMemoryCursorStore(),
      recompute: jest.fn(),
      sessionUserId,
    });
    expect(upsertCalls).toHaveLength(0);
  });

  it('stops the per-row fallback at the row where the account changed', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await insertPrediction(localPrediction({ id: 'a' }));
    await insertPrediction(localPrediction({ id: 'b' }));
    const { client, upsertCalls } = makeFakeClient({
      upsertResults: [{ error: { message: 'batch failed' } }, { error: null }, { error: null }],
    });
    // The batch and the first row go under user-aaa; then the session changes.
    const checks = ['user-aaa', 'user-aaa', 'user-bbb'];
    const stillCurrent = jest.fn(async () => checks.shift() === 'user-aaa');

    const pushed = await pushDirty('user-aaa', client, stillCurrent);
    expect(pushed).toBe(1);
    // The batch, then one row: nothing after the change.
    expect(upsertCalls).toHaveLength(2);
    expect(await listDirtyPredictions('user-aaa')).toHaveLength(1);
    jest.restoreAllMocks();
  });

  it("pushes nothing by default when the client's session is someone else's", async () => {
    await insertPrediction(localPrediction({ id: 'a' }));
    const { client, upsertCalls } = makeFakeClient();
    (client as unknown as { auth: unknown }).auth = sessionOf('user-bbb');

    expect(await pushDirty('user-aaa', client)).toBe(0);
    expect(upsertCalls).toHaveLength(0);
  });

  it('reads a session that cannot be read as someone else’s', async () => {
    await insertPrediction(localPrediction({ id: 'a' }));
    const { client, upsertCalls } = makeFakeClient();
    (client as unknown as { auth: unknown }).auth = {
      getSession: async () => {
        throw new Error('storage');
      },
    };

    expect(await pushDirty('user-aaa', client)).toBe(0);
    expect(upsertCalls).toHaveLength(0);
  });
});

describe('what a failed push writes to the log', () => {
  it("carries the error's code and message, never its details, hint or the row", async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await insertPrediction(localPrediction({ id: 'a', title: 'See Dr. Patel about the lump' }));
    const postgresError = {
      code: '23514',
      message: 'new row for relation "predictions" violates check constraint "predictions_confidence_check"',
      details: 'Failing row contains (a, user-aaa, See Dr. Patel about the lump, health, 101, ...).',
      hint: 'value: See Dr. Patel about the lump',
    };
    const { client } = makeFakeClient({
      upsertResults: [{ error: postgresError }, { error: postgresError }],
    } as never);

    await pushDirty('user-aaa', client);

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('23514');
    expect(logged).toContain('violates check constraint');
    expect(logged).not.toContain('Patel');
    expect(logged).not.toContain('Failing row');
    expect(logged).not.toContain('user-aaa');
    jest.restoreAllMocks();
  });
});

describe('clearSyncCursor', () => {
  it("forgets the user's cursor and no one else's", async () => {
    const store = makeInMemoryCursorStore();
    const withRemove: CursorStore = {
      ...store,
      async remove(userId) {
        store.storage.delete(userId);
      },
    };
    await withRemove.set('user-aaa', '2026-05-20T00:00:00.000Z');
    await withRemove.set('user-bbb', '2026-05-21T00:00:00.000Z');

    await clearSyncCursor('user-aaa', withRemove);
    expect(store.storage.has('user-aaa')).toBe(false);
    expect(store.storage.get('user-bbb')).toBe('2026-05-21T00:00:00.000Z');
  });

  it('removes the AsyncStorage key the pull writes, by default', async () => {
    const removeItem = jest.fn(async () => {});
    await jest.isolateModulesAsync(async () => {
      jest.doMock('@react-native-async-storage/async-storage', () => ({
        __esModule: true,
        default: { getItem: jest.fn(), setItem: jest.fn(), removeItem },
      }));
      const sync = require('./sync') as typeof import('./sync');
      await sync.clearSyncCursor('user-aaa');
    });
    expect(removeItem).toHaveBeenCalledWith('calibrate:sync_cursor:user-aaa');
  });

  it('never throws', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const failing: CursorStore = {
      get: async () => null,
      set: async () => {},
      remove: async () => {
        throw new Error('storage');
      },
    };
    await expect(clearSyncCursor('user-aaa', failing)).resolves.toBeUndefined();
    // A store without remove (an older fake) is a no-op.
    await expect(clearSyncCursor('user-aaa', makeInMemoryCursorStore())).resolves.toBeUndefined();
    jest.restoreAllMocks();
  });
});
