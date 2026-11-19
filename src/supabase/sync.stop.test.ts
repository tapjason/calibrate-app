// Sign-out takes the account's rows off the phone (D69 (a), security review
// round 5): one more push first (`pushNow`), and before the wipe the
// account's sync is stopped (`stopSyncFor`) so a pull whose answer comes late
// can't put rows back after it.

import type { SupabaseClient } from '@supabase/supabase-js';

import { setDbForTests } from '@/db/client';
import {
  countUnsynced,
  deletePrediction,
  getPrediction,
  insertPrediction,
} from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import type { Prediction, PredictionWireRow } from '@/types';

import {
  __resetSyncStateForTests,
  pushNow,
  resumeSyncFor,
  stopSyncFor,
  syncNow,
  unsyncedRows,
  type CursorStore,
} from './sync';

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
  ...prediction({ id: 'remote-1', title: 'From the server' }),
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

/**
 * A client whose pull answers when the test says (`answerPull`), and that
 * records pushes and deletions. Its session is USER's.
 */
function fakeClient(opts: { pullRows?: PredictionWireRow[]; hangPush?: boolean } = {}) {
  const calls: string[] = [];
  let answerPull: () => void = () => {};
  const pullAnswered = new Promise<void>((r) => (answerPull = r));
  let pullAsked = false;
  const from = () => ({
    select() {
      const q = {
        eq: () => q,
        gt: () => q,
        order: () => q,
        async limit() {
          pullAsked = true;
          calls.push('pull');
          await pullAnswered;
          return { data: opts.pullRows ?? [], error: null };
        },
        // Round 6 (item 6): the read of a row after a conditional delete
        // that removed nothing. The server holds none here.
        async in() {
          return { data: [], error: null };
        },
      };
      return q;
    },
    upsert(rows: PredictionWireRow[]) {
      calls.push(`upsert:${rows.map((r) => r.id).join(',')}`);
      if (opts.hangPush) return new Promise(() => {});
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
          calls.push(`delete:${String(filters.id)}`);
          return Promise.resolve({ data: [{ id: filters.id }], error: null });
        },
      };
      return q;
    },
  });
  const client = {
    from,
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER } } }, error: null }),
    },
  } as unknown as SupabaseClient;
  return { client, calls, answerPull: () => answerPull(), pullAsked: () => pullAsked };
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  __resetSyncStateForTests();
});

afterEach(() => {
  jest.useRealTimers();
  setDbForTests(null);
  __resetSyncStateForTests();
});

describe('pushNow (sign-out pushes once more)', () => {
  it('sends what is waiting to be deleted, then every dirty row, and pulls nothing', async () => {
    await insertPrediction(prediction({ id: 'dirty-1' }));
    await insertPrediction(prediction({ id: 'gone-1' }));
    await deletePrediction('gone-1');
    expect(await countUnsynced(USER)).toBe(2);
    const { client, calls } = fakeClient();
    const recompute = jest.fn(async () => {});

    await expect(pushNow(USER, { client, recompute })).resolves.toBe(2);
    expect(calls).toEqual(['delete:gone-1', 'upsert:dirty-1']);
    expect(recompute).not.toHaveBeenCalled();
    expect(await countUnsynced(USER)).toBe(0);
  });

  it('waits for a sweep already running, then pushes what it left', async () => {
    const { client, calls, answerPull } = fakeClient();
    const store = cursorStore();
    const sweep = syncNow(USER, { client, cursorStore: store, recompute: async () => {} });
    // A row written while the sweep waits on its pull.
    await insertPrediction(prediction({ id: 'late-1' }));
    const pushing = pushNow(USER, { client });
    answerPull();
    await sweep;
    await expect(pushing).resolves.toBeGreaterThanOrEqual(0);
    expect(calls.filter((c) => c === 'upsert:late-1').length).toBeGreaterThanOrEqual(1);
    expect(await countUnsynced(USER)).toBe(0);
  });

  it('gives up waiting after its time, never throws, and leaves the rows counted as unsynced', async () => {
    jest.useFakeTimers();
    await insertPrediction(prediction({ id: 'dirty-1' }));
    const { client } = fakeClient({ hangPush: true });
    const pushing = pushNow(USER, { client }, 1_000);
    await jest.advanceTimersByTimeAsync(1_000);
    await expect(pushing).resolves.toBe(0);
    jest.useRealTimers();
    expect(await countUnsynced(USER)).toBe(1);
  });

  it('does nothing for the guest, no one, or a client that is missing', async () => {
    await expect(pushNow(null)).resolves.toBe(0);
    await expect(pushNow('local-guest')).resolves.toBe(0);
    await insertPrediction(prediction({ id: 'dirty-1' }));
    await expect(pushNow(USER, { client: null })).resolves.toBe(0);
  });
});

describe('stopSyncFor (before the account leaves the phone)', () => {
  it('a pull whose answer comes after the stop writes nothing, moves no cursor and runs no recompute', async () => {
    const { client, answerPull, pullAsked } = fakeClient({ pullRows: [wire()] });
    const store = cursorStore();
    const recompute = jest.fn(async () => {});
    const sweep = syncNow(USER, { client, cursorStore: store, recompute });
    // Let the sweep reach its pull.
    for (let i = 0; i < 20 && !pullAsked(); i += 1) await new Promise((r) => setImmediate(r));
    expect(pullAsked()).toBe(true);

    let stopped = false;
    const stopping = (async () => {
      await stopSyncFor(USER);
      stopped = true;
    })();
    await new Promise((r) => setImmediate(r));
    // The stop waits for the running sweep.
    expect(stopped).toBe(false);

    answerPull();
    await expect(sweep).resolves.toEqual({ pulled: 0, pushed: 0 });
    await stopping;
    expect(await getPrediction('remote-1')).toBeNull();
    expect(store.storage.has(USER)).toBe(false);
    expect(recompute).not.toHaveBeenCalled();
  });

  it('a stopped account starts no sweep, until it may sync again', async () => {
    const { client, calls, answerPull } = fakeClient();
    answerPull();
    await stopSyncFor(USER);
    await expect(
      syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} }),
    ).resolves.toEqual({ pulled: 0, pushed: 0 });
    await expect(pushNow(USER, { client })).resolves.toBe(0);
    expect(calls).toEqual([]);

    resumeSyncFor(USER);
    await syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} });
    expect(calls).toContain('pull');
  });

  it('a sweep not yet at its pull stops before it, sending nothing', async () => {
    await insertPrediction(prediction({ id: 'dirty-1' }));
    const { client, calls, pullAsked } = fakeClient();
    const sweep = syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} });
    await stopSyncFor(USER);
    await expect(sweep).resolves.toEqual({ pulled: 0, pushed: 0 });
    expect(pullAsked()).toBe(false);
    expect(calls).toEqual([]);
  });

  it('waits for a sweep stuck on the network at most its time; the answer, when it comes, writes nothing', async () => {
    const { client, answerPull, pullAsked } = fakeClient({ pullRows: [wire()] });
    let finished = false;
    const sweep = (async () => {
      await syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} });
      finished = true;
    })();
    for (let i = 0; i < 20 && !pullAsked(); i += 1) await new Promise((r) => setImmediate(r));
    expect(pullAsked()).toBe(true);

    await stopSyncFor(USER, 30);
    expect(finished).toBe(false);

    answerPull();
    await sweep;
    expect(await getPrediction('remote-1')).toBeNull();
  });

  it('touches only the account it stops', async () => {
    await stopSyncFor(USER);
    const other = fakeClient();
    other.answerPull();
    // Another account's sweep still runs (its session check is its own).
    const otherClient = {
      ...other.client,
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'user-bbb' } } }, error: null }),
      },
    } as unknown as SupabaseClient;
    await syncNow('user-bbb', { client: otherClient, cursorStore: cursorStore(), recompute: async () => {} });
    expect(other.calls).toContain('pull');
  });
});

// Round 6: what sign-out's recount reads (N2), and a stop that also waits for
// sign-out's one more push when that push outlasted its own wait.
describe('round 6', () => {
  it('stopSyncFor waits for a pushNow still running after its own wait', async () => {
    await insertPrediction(prediction({ id: 'dirty-1' }));
    let answerUpsert: () => void = () => {};
    const upsertAnswered = new Promise<void>((r) => (answerUpsert = r));
    const client = {
      from: () => ({
        upsert: async () => {
          await upsertAnswered;
          return { error: null };
        },
      }),
      auth: {
        getSession: async () => ({ data: { session: { user: { id: USER } } }, error: null }),
      },
    } as unknown as SupabaseClient;

    // Its own wait ends; the upsert is still on the network.
    await expect(pushNow(USER, { client }, 20)).resolves.toBe(0);

    let stopped = false;
    const stopping = (async () => {
      await stopSyncFor(USER);
      stopped = true;
    })();
    for (let i = 0; i < 10; i += 1) await new Promise((r) => setImmediate(r));
    expect(stopped).toBe(false);

    answerUpsert();
    await stopping;
    expect(stopped).toBe(true);
  });

  it('unsyncedRows: each dirty row with its updated_at, and no deletion (the wipe keeps those)', async () => {
    await insertPrediction(prediction({ id: 'dirty-1' }));
    await insertPrediction(prediction({ id: 'dirty-2' }));
    await insertPrediction(prediction({ id: 'gone-1' }));
    await deletePrediction('gone-1');
    const rows = await unsyncedRows(USER);
    expect([...rows.keys()].sort()).toEqual(['dirty-1', 'dirty-2']);
    for (const value of rows.values()) expect(typeof value).toBe('string');
    // Another account's rows aren't in it.
    await expect(unsyncedRows('user-bbb')).resolves.toEqual(new Map());
  });
});
