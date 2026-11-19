// The under-13 rule in sync (roadmap D70, 2026-11-19;
// docs/design/research/under-13-2026-11.md). Under the rule nothing is sent:
// every entry point and exported helper is tried with a Supabase client whose
// every property access throws, so one that reached the network would show.
// A sweep already running stops before its next request; sign-out's last push
// sends nothing, so its question counts every change; and on a launch that
// asks Apple, a sweep waits for the answer, at most 60 s from when the age
// store began waiting, after which every gate still holds.

import type { SupabaseClient } from '@supabase/supabase-js';

import { setDbForTests } from '@/db/client';
import { countUnsynced, deletePrediction, insertPrediction } from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import type { Prediction } from '@/types';

import {
  __resetSyncStateForTests,
  AGE_SYNC_WAIT_MS,
  backfillOffsets,
  pullRemote,
  pushDeletions,
  pushDirty,
  pushNow,
  stopSyncFor,
  syncNow,
  unsyncedRows,
  type CursorStore,
} from './sync';

const USER = 'user-aaa';
const UNDER_13 = { lowerBound: null, upperBound: 12 };

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

function cursorStore(): CursorStore {
  const storage = new Map<string, string>();
  return {
    async get(userId) {
      return storage.get(userId) ?? null;
    },
    async set(userId, cursor) {
      storage.set(userId, cursor);
    },
  };
}

/** A client whose every property access throws, and the properties tried. */
function throwingClient(): { client: SupabaseClient; touched: string[] } {
  const touched: string[] = [];
  const client = new Proxy(
    {},
    {
      get(_target, prop) {
        touched.push(String(prop));
        throw new Error(`nothing may reach the network here: ${String(prop)}`);
      },
    },
  ) as unknown as SupabaseClient;
  return { client, touched };
}

/**
 * A client that records each request and runs `onRequest` as it is sent (to
 * turn the rule on mid-sweep). Its session is USER's; the pull returns nothing.
 */
function recordingClient(opts: { onRequest?: (call: string) => void; failBatches?: boolean } = {}) {
  const calls: string[] = [];
  const record = (call: string) => {
    calls.push(call);
    opts.onRequest?.(call);
  };
  const from = () => ({
    select() {
      const q = {
        eq: () => q,
        gt: () => q,
        order: () => q,
        async limit() {
          record('pull');
          return { data: [], error: null };
        },
        async in() {
          record('read');
          return { data: [], error: null };
        },
      };
      return q;
    },
    upsert(rows: Array<{ id: string }>) {
      record(`upsert:${rows.map((r) => r.id).join(',')}`);
      if (opts.failBatches && rows.length > 1) {
        return Promise.resolve({ error: { code: 'XX000', message: 'batch refused' } });
      }
      return Promise.resolve({ error: null });
    },
    delete() {
      const filters: Record<string, unknown> = {};
      const q = {
        eq(col: string, val: unknown) {
          filters[col] = val;
          return q;
        },
        or: () => q,
        select: () => {
          record(`delete:${String(filters.id)}`);
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
  return { client, calls };
}

/** Rows waiting to go up: two dirty predictions and one deletion. */
async function seedUnsynced(): Promise<void> {
  await insertPrediction(prediction({ id: 'dirty-1' }));
  await insertPrediction(prediction({ id: 'dirty-2' }));
  await insertPrediction(prediction({ id: 'gone-1' }));
  await deletePrediction('gone-1');
}

/** The rule on, as a stored under-13 band read at launch would turn it on. */
function underTheRule(): void {
  useAgeStore.getState().load(UNDER_13, { willAsk: false });
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  __resetSyncStateForTests();
  __resetAgeStoreForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  __resetSyncStateForTests();
  __resetAgeStoreForTests();
  setDbForTests(null);
  jest.restoreAllMocks();
});

describe('sync under the rule (D70): nothing is sent', () => {
  it('every entry point and helper returns at once, touching no client', async () => {
    await seedUnsynced();
    const before = await countUnsynced(USER);
    underTheRule();
    const { client, touched } = throwingClient();
    const yes = async () => true;

    await expect(syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} })).resolves.toEqual({
      pulled: 0,
      pushed: 0,
    });
    await expect(pushNow(USER, { client })).resolves.toBe(0);
    await expect(backfillOffsets(USER, client, yes)).resolves.toEqual({ sent: 0, done: false });
    await expect(pullRemote(USER, client, cursorStore())).resolves.toBe(0);
    // Even with a session check that always says yes.
    await expect(pushDirty(USER, client, yes)).resolves.toBe(0);
    await expect(pushDeletions(USER, client, yes)).resolves.toBe(0);

    expect(touched).toEqual([]);
    expect(await countUnsynced(USER)).toBe(before);
  });

  // The test above would see a missing gate: without the rule, the same
  // client is touched.
  it('without the rule, the same calls reach the client', async () => {
    await seedUnsynced();
    const { client, touched } = throwingClient();

    await pushDirty(USER, client, async () => true);

    expect(touched.length).toBeGreaterThan(0);
  });

  it("sign-out's last push sends nothing, so every change is still counted", async () => {
    await seedUnsynced();
    underTheRule();
    const { client, touched } = throwingClient();

    await expect(pushNow(USER, { client })).resolves.toBe(0);

    expect(touched).toEqual([]);
    // Two dirty rows and the deletion: what the sign-out question names.
    expect(await countUnsynced(USER)).toBe(3);
    expect([...(await unsyncedRows(USER)).keys()].sort()).toEqual(['dirty-1', 'dirty-2']);
  });
});

describe('a sweep under way when the rule comes on', () => {
  it('stops before its next request', async () => {
    await seedUnsynced();
    // The rule arrives while the deletion is on its way.
    const { client, calls } = recordingClient({
      onRequest: (call) => {
        if (call.startsWith('delete:')) underTheRule();
      },
    });

    await expect(
      syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} }),
    ).resolves.toEqual({ pulled: 0, pushed: 0 });

    expect(calls).toEqual(['delete:gone-1']);
    expect([...(await unsyncedRows(USER)).keys()].sort()).toEqual(['dirty-1', 'dirty-2']);
  });

  it('a push falling back to one row at a time stops too', async () => {
    await seedUnsynced();
    const { client, calls } = recordingClient({
      failBatches: true,
      onRequest: (call) => {
        if (call === 'upsert:dirty-1,dirty-2') underTheRule();
      },
    });

    await expect(pushDirty(USER, client, async () => true)).resolves.toBe(0);

    expect(calls).toEqual(['upsert:dirty-1,dirty-2']);
    expect(await countUnsynced(USER)).toBe(3);
  });
});

describe('a launch that asks Apple', () => {
  it('a sweep waits for the answer, then goes on when it is not under 13', async () => {
    await seedUnsynced();
    useAgeStore.getState().load(null, { willAsk: true });
    const { client, calls } = recordingClient();

    const sweep = syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} });
    for (let i = 0; i < 10; i += 1) await new Promise((r) => setImmediate(r));
    expect(calls).toEqual([]);

    await useAgeStore.getState().accept({ lowerBound: 18, upperBound: null });
    useAgeStore.getState().markSettled();
    await sweep;

    expect(calls).toEqual(['delete:gone-1', 'pull', 'upsert:dirty-1,dirty-2']);
  });

  it('an under-13 answer means the waiting sweep sends nothing', async () => {
    await seedUnsynced();
    useAgeStore.getState().load(null, { willAsk: true });
    const { client, touched } = throwingClient();

    const sweep = syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} });
    await useAgeStore.getState().accept(UNDER_13);
    useAgeStore.getState().markSettled();

    await expect(sweep).resolves.toEqual({ pulled: 0, pushed: 0 });
    expect(touched).toEqual([]);
  });

  it('stopping the account ends the wait, and nothing is sent', async () => {
    await seedUnsynced();
    useAgeStore.getState().load(null, { willAsk: true });
    const { client, touched } = throwingClient();

    const sweep = syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} });
    await stopSyncFor(USER, 1_000);

    await expect(sweep).resolves.toEqual({ pulled: 0, pushed: 0 });
    expect(touched).toEqual([]);
  });

  it("sign-out's push waits at most 5 s for the answer, then goes on", async () => {
    jest.useFakeTimers();
    await insertPrediction(prediction({ id: 'dirty-1' }));
    useAgeStore.getState().load(null, { willAsk: true });
    const { client, calls } = recordingClient();

    const pushing = pushNow(USER, { client });
    await jest.advanceTimersByTimeAsync(4_999);
    expect(calls).toEqual([]);
    await jest.advanceTimersByTimeAsync(1);
    await jest.advanceTimersByTimeAsync(10);

    await expect(pushing).resolves.toBe(1);
    expect(calls).toEqual(['upsert:dirty-1']);
  });

  // Main session, 2026-11-19: the sweep's wait has a 60 s cap, so a backup
  // isn't held all run by an answer that never comes.
  it('the 60 s cap releases a waiting sweep, which then goes on as before', async () => {
    jest.useFakeTimers();
    await seedUnsynced();
    useAgeStore.getState().load(null, { willAsk: true });
    const { client, calls } = recordingClient();

    const sweep = syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} });
    await jest.advanceTimersByTimeAsync(AGE_SYNC_WAIT_MS - 1);
    expect(calls).toEqual([]);
    await jest.advanceTimersByTimeAsync(1);
    await jest.advanceTimersByTimeAsync(10);

    await expect(sweep).resolves.toEqual({ pulled: 0, pushed: 2 });
    expect(calls).toEqual(['delete:gone-1', 'pull', 'upsert:dirty-1,dirty-2']);
    expect(useAgeStore.getState().settled).toBe(false);
  });

  it('the cap counts from when the age store began waiting, not from the sweep', async () => {
    jest.useFakeTimers();
    await insertPrediction(prediction({ id: 'dirty-1' }));
    useAgeStore.getState().load(null, { willAsk: true });
    await jest.advanceTimersByTimeAsync(40_000);
    const { client, calls } = recordingClient();

    const sweep = syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} });
    await jest.advanceTimersByTimeAsync(AGE_SYNC_WAIT_MS - 40_000 - 1);
    expect(calls).toEqual([]);
    await jest.advanceTimersByTimeAsync(1);
    await jest.advanceTimersByTimeAsync(10);

    await expect(sweep).resolves.toEqual({ pulled: 0, pushed: 1 });
    expect(calls).toEqual(['pull', 'upsert:dirty-1']);
  });

  it('past the cap, an under-13 answer mid-sweep stops it before its next request, and then nothing is sent', async () => {
    jest.useFakeTimers();
    await seedUnsynced();
    useAgeStore.getState().load(null, { willAsk: true });
    // The answer arrives while the sweep's first request is on its way.
    const { client, calls } = recordingClient({
      onRequest: (call) => {
        if (call.startsWith('delete:')) {
          void useAgeStore.getState().accept(UNDER_13);
          useAgeStore.getState().markSettled();
        }
      },
    });

    const sweep = syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} });
    await jest.advanceTimersByTimeAsync(AGE_SYNC_WAIT_MS);
    await jest.advanceTimersByTimeAsync(10);
    await expect(sweep).resolves.toEqual({ pulled: 0, pushed: 0 });

    expect(calls).toEqual(['delete:gone-1']);
    expect(useAgeStore.getState().localOnly).toBe(true);
    expect([...(await unsyncedRows(USER)).keys()].sort()).toEqual(['dirty-1', 'dirty-2']);

    // And from then on the entry points send nothing.
    const { client: throwing, touched } = throwingClient();
    await expect(
      syncNow(USER, { client: throwing, cursorStore: cursorStore(), recompute: async () => {} }),
    ).resolves.toEqual({ pulled: 0, pushed: 0 });
    await expect(pushNow(USER, { client: throwing })).resolves.toBe(0);
    expect(touched).toEqual([]);
  });

  it('a wait ended by a stop leaves no timer behind', async () => {
    jest.useFakeTimers();
    useAgeStore.getState().load(null, { willAsk: true });
    const { client, touched } = throwingClient();

    const sweep = syncNow(USER, { client, cursorStore: cursorStore(), recompute: async () => {} });
    await jest.advanceTimersByTimeAsync(0);
    expect(jest.getTimerCount()).toBe(1);
    await stopSyncFor(USER, 1_000);

    await expect(sweep).resolves.toEqual({ pulled: 0, pushed: 0 });
    expect(jest.getTimerCount()).toBe(0);
    expect(touched).toEqual([]);
  });

  it("stopping the account ends sign-out's wait for the answer, sending nothing", async () => {
    await insertPrediction(prediction({ id: 'dirty-1' }));
    useAgeStore.getState().load(null, { willAsk: true });
    const { client, touched } = throwingClient();

    const pushing = pushNow(USER, { client });
    await new Promise((r) => setImmediate(r));
    const started = Date.now();
    await stopSyncFor(USER, 3_000);

    await expect(pushing).resolves.toBe(0);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(touched).toEqual([]);
  });

  it("sign-out's push sends nothing when an under-13 answer comes within the 5 s", async () => {
    jest.useFakeTimers();
    await insertPrediction(prediction({ id: 'dirty-1' }));
    useAgeStore.getState().load(null, { willAsk: true });
    const { client, touched } = throwingClient();

    const pushing = pushNow(USER, { client });
    await jest.advanceTimersByTimeAsync(1_000);
    await useAgeStore.getState().accept(UNDER_13);
    useAgeStore.getState().markSettled();
    await jest.advanceTimersByTimeAsync(10);

    await expect(pushing).resolves.toBe(0);
    expect(touched).toEqual([]);
  });
});
