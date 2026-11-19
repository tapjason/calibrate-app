// The under-13 rule in usage counts (roadmap D70, 2026-11-19;
// docs/design/research/under-13-2026-11.md). Nothing is queued under the
// rule; nothing is sent unless `uploadsMayStart()` (Apple has answered on a
// launch that asks, and the rule doesn't apply); and a flush under way stops
// when the rule comes on. Tried with a client whose every property access
// throws.

import type { SupabaseClient } from '@supabase/supabase-js';

import { countUnsyncedEvents, enqueueEvent } from '@/db/analytics';
import { setDbForTests } from '@/db/client';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { createTestDb } from '@/db/testing';
import { __resetAgeStoreForTests, useAgeStore } from '@/store/ageStore';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';

import { flushEvents } from './flush';
import { track } from './track';

const USER = 'user-1';
const UNDER_13 = { lowerBound: null, upperBound: 12 };

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

/** A client recording each insert, running `onInsert` as one is sent. */
function recordingClient(opts: { onInsert?: (ids: string[]) => void; failBatches?: boolean } = {}) {
  const inserts: string[][] = [];
  const client = {
    from: () => ({
      insert: async (rows: Array<{ id: string }>) => {
        const ids = rows.map((r) => r.id);
        inserts.push(ids);
        opts.onInsert?.(ids);
        if (opts.failBatches && rows.length > 1) return { error: { code: 'XX000', message: 'refused' }, status: 500 };
        return { error: null, status: 201 };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, inserts };
}

async function seed(n: number, userId = USER): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await enqueueEvent({
      id: userId === USER ? `e${i}` : `g${i}`,
      user_id: userId,
      name: 'warmup_started',
      props: {},
      created_at: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    });
  }
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  __resetAgeStoreForTests();
  useAuthStore.setState({ userId: USER, email: null, status: 'authenticated' });
  useSettingsStore.setState({ analyticsEnabled: true, usageNoticeShownAt: '2026-11-19T09:00:00.000Z' });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  __resetAgeStoreForTests();
  useSettingsStore.setState({ usageNoticeShownAt: null });
  setDbForTests(null);
  jest.restoreAllMocks();
});

describe('track under the rule (D70)', () => {
  it('queues nothing', async () => {
    useAgeStore.getState().load(UNDER_13, { willAsk: false });

    await track('warmup_started');
    await track('prediction_logged', { confidence: 70 });

    await expect(countUnsyncedEvents()).resolves.toBe(0);
  });

  it('queues as before without the rule, and while Apple is still being asked', async () => {
    await track('warmup_started');
    useAgeStore.getState().load(null, { willAsk: true });
    await track('warmup_completed');

    await expect(countUnsyncedEvents()).resolves.toBe(2);
  });
});

describe('flushEvents under the rule (D70)', () => {
  it('sends nothing, signed in or a guest, touching no client', async () => {
    await seed(3);
    await seed(2, LOCAL_GUEST_USER_ID);
    useAgeStore.getState().load(UNDER_13, { willAsk: false });
    const { client, touched } = throwingClient();

    await expect(flushEvents(USER, { client })).resolves.toBe(0);
    await expect(flushEvents(LOCAL_GUEST_USER_ID, { client })).resolves.toBe(0);

    expect(touched).toEqual([]);
    await expect(countUnsyncedEvents()).resolves.toBe(5);
  });

  it('sends nothing before Apple has answered on a launch that asks, then goes on', async () => {
    await seed(2);
    useAgeStore.getState().load(null, { willAsk: true });
    const throwing = throwingClient();

    await expect(flushEvents(USER, { client: throwing.client })).resolves.toBe(0);
    expect(throwing.touched).toEqual([]);

    useAgeStore.getState().markSettled();
    const { client, inserts } = recordingClient();
    await expect(flushEvents(USER, { client })).resolves.toBe(2);
    expect(inserts).toEqual([['e0', 'e1']]);
  });

  it('a flush under way stops before its next request when the rule comes on', async () => {
    await seed(3);
    const { client, inserts } = recordingClient({
      failBatches: true,
      onInsert: (ids) => {
        if (ids.length === 1) useAgeStore.getState().load(UNDER_13, { willAsk: false });
      },
    });

    await flushEvents(USER, { client });

    // The batch, then the first row alone, whose send brought the rule; no more.
    expect(inserts).toEqual([['e0', 'e1', 'e2'], ['e0']]);
  });

  it('without the rule, the same call reaches the client', async () => {
    await seed(1);
    const { client, touched } = throwingClient();

    await flushEvents(USER, { client });

    expect(touched).toContain('from');
  });
});
