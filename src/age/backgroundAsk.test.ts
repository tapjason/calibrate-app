// The background ask about a stored band of 13 or over (review 2026-11-19,
// item 1; roadmap D70). The band belongs to the install, not to the Apple
// Account, so it is asked about at every launch where the API can run, with
// the age store settled from the start: an adult waits for nothing, so the
// usage-count flush and a sync sweep are already running when the answer
// comes. An under-13 answer closes the gate mid-run (`accept`), and the
// per-request checks in src/analytics/flush.ts and src/supabase/sync.ts stop
// what is in flight before its next request; after that nothing is sent.
//
// Real age service, age store, flush and sync; only Apple's API and the
// Supabase client are fakes. Each fake request is held until the gate has
// closed, the way a slow request would be when the answer lands mid-flight.
// (What `initLocalOnly` does on entering, clearing the queue among it, is in
// localOnly.test.ts.)

import type { SupabaseClient } from '@supabase/supabase-js';

import { flushEvents } from '@/analytics/flush';
import { saveAgeBucket } from '@/db/ageBucket';
import { countUnsyncedEvents, enqueueEvent } from '@/db/analytics';
import { setDbForTests } from '@/db/client';
import { deletePrediction, insertPrediction } from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import { __resetAgeStoreForTests, isLocalOnly, useAgeStore } from '@/store/ageStore';
import { useSettingsStore } from '@/store/settingsStore';
import { __resetSyncStateForTests, syncNow, unsyncedRows, type CursorStore } from '@/supabase/sync';
import type { Prediction } from '@/types';

import { __setAgeRangeDepsForTests, ensureAgeBucket, hydrateAgeGate } from './ageRange';

const USER = 'user-aaa';
const ADULT = { lowerBound: 18, upperBound: null };
const UNDER_13 = { lowerBound: null, upperBound: 12 };

/** Waits (a few turns of the event loop at most) until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !done(); i += 1) await new Promise((r) => setImmediate(r));
  if (!done()) throw new Error('the condition never held');
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
 * Apple's API, answering the launch's ask only when told to. The phone holds
 * an adult band, so the launch is settled and nothing waits for this.
 */
async function adultPhoneWithAPendingAsk(): Promise<{ answer: (band: unknown) => void; asked: Promise<unknown> }> {
  await saveAgeBucket(ADULT);
  let answer: (band: unknown) => void = () => {};
  const request = jest.fn(() => new Promise((resolve) => (answer = resolve)));
  __setAgeRangeDepsForTests({ isAvailable: () => true, request });
  await hydrateAgeGate();
  expect(useAgeStore.getState()).toMatchObject({ localOnly: false, settled: true });
  const asked = ensureAgeBucket();
  await until(() => request.mock.calls.length > 0);
  return { answer: (band) => answer(band), asked };
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  __resetAgeStoreForTests();
  __resetSyncStateForTests();
  __setAgeRangeDepsForTests(null);
  useSettingsStore.setState({ analyticsEnabled: true, usageNoticeShownAt: '2026-11-19T09:00:00.000Z' });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  __setAgeRangeDepsForTests(null);
  __resetSyncStateForTests();
  __resetAgeStoreForTests();
  useSettingsStore.setState({ usageNoticeShownAt: null });
  setDbForTests(null);
  jest.restoreAllMocks();
});

describe('an under-13 answer to the background ask stops what is in flight', () => {
  it('the usage-count flush stops before its next request, and nothing is sent afterwards', async () => {
    for (let i = 0; i < 3; i += 1) {
      await enqueueEvent({
        id: `e${i}`,
        user_id: USER,
        name: 'warmup_started',
        props: {},
        created_at: new Date(1_700_000_000_000 + i * 1000).toISOString(),
      });
    }
    const apple = await adultPhoneWithAPendingAsk();
    const inserts: string[][] = [];
    const client = {
      from: () => ({
        insert: async (rows: Array<{ id: string }>) => {
          inserts.push(rows.map((r) => r.id));
          // The batch is refused, so the flush goes row by row; the answer
          // lands while the first row is on its way.
          if (rows.length > 1) return { error: { code: 'XX000', message: 'refused' }, status: 500 };
          apple.answer(UNDER_13);
          await until(isLocalOnly);
          return { error: null, status: 201 };
        },
      }),
    } as unknown as SupabaseClient;

    await flushEvents(USER, { client });
    await apple.asked;

    expect(inserts).toEqual([['e0', 'e1', 'e2'], ['e0']]);
    expect(useAgeStore.getState()).toMatchObject({ localOnly: true, settled: true });
    // The row that landed is cleared; the rest stay on the phone.
    await expect(countUnsyncedEvents()).resolves.toBe(2);

    const after = throwingClient();
    await expect(flushEvents(USER, { client: after.client })).resolves.toBe(0);
    expect(after.touched).toEqual([]);
  });

  it('a sync sweep stops before its next request, and nothing is sent afterwards', async () => {
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
    await insertPrediction(prediction('dirty-1'));
    await insertPrediction(prediction('dirty-2'));
    await insertPrediction(prediction('gone-1'));
    await deletePrediction('gone-1');
    const apple = await adultPhoneWithAPendingAsk();

    const calls: string[] = [];
    const client = {
      from: () => ({
        select() {
          const q = {
            eq: () => q,
            gt: () => q,
            order: () => q,
            async limit() {
              calls.push('pull');
              return { data: [], error: null };
            },
            async in() {
              calls.push('read');
              return { data: [], error: null };
            },
          };
          return q;
        },
        upsert(rows: Array<{ id: string }>) {
          calls.push(`upsert:${rows.map((r) => r.id).join(',')}`);
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
            select: async () => {
              calls.push(`delete:${String(filters.id)}`);
              // The answer lands while the deletion is on its way.
              apple.answer(UNDER_13);
              await until(isLocalOnly);
              return { data: [{ id: filters.id }], error: null };
            },
          };
          return q;
        },
      }),
      auth: {
        getSession: async () => ({ data: { session: { user: { id: USER } } }, error: null }),
      },
    } as unknown as SupabaseClient;
    const cursors = new Map<string, string>();
    const cursorStore: CursorStore = {
      async get(userId) {
        return cursors.get(userId) ?? null;
      },
      async set(userId, cursor) {
        cursors.set(userId, cursor);
      },
    };

    await syncNow(USER, { client, cursorStore, recompute: async () => {} });
    await apple.asked;

    expect(calls).toEqual(['delete:gone-1']);
    expect([...(await unsyncedRows(USER)).keys()].sort()).toEqual(['dirty-1', 'dirty-2']);

    const after = throwingClient();
    await expect(syncNow(USER, { client: after.client, cursorStore, recompute: async () => {} })).resolves.toEqual({
      pulled: 0,
      pushed: 0,
    });
    expect(after.touched).toEqual([]);
  });
});
