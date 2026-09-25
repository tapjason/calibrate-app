import type { SupabaseClient } from '@supabase/supabase-js';

import { countUnsyncedEvents, enqueueEvent } from '@/db/analytics';
import { setDbForTests } from '@/db/client';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import { createTestDb } from '@/db/testing';
import { useSettingsStore } from '@/store/settingsStore';

import { flushEvents } from './flush';

const USER = 'user-1';

/** What the flush sends for one event. */
interface WireRow {
  id: string;
  user_id: string;
  name: string;
  props: Record<string, unknown>;
  created_at: string;
}

type InsertMock = jest.Mock<Promise<{ error: unknown }>, [WireRow[]]>;

/** A Supabase client stub exposing only .from(...).insert(...). */
function fakeClient(insert: InsertMock): SupabaseClient {
  return { from: () => ({ insert }) } as unknown as SupabaseClient;
}

const ok = (): InsertMock =>
  jest.fn(async (_rows: WireRow[]) => ({ error: null as unknown }));

async function seed(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await enqueueEvent({
      id: `e${i}`,
      user_id: USER,
      name: 'share_completed',
      props: { surface: 'card' },
      created_at: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    });
  }
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  useSettingsStore.setState({ analyticsEnabled: true });
});

afterEach(() => {
  setDbForTests(null);
  jest.restoreAllMocks();
});

describe('flushEvents', () => {
  it('pushes queued events and clears them locally', async () => {
    await seed(3);
    const insert = ok();

    await expect(
      flushEvents(USER, { client: fakeClient(insert) }),
    ).resolves.toBe(3);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]![0]).toHaveLength(3);
    // Once a row is on the server, a second copy on the device serves nobody.
    await expect(countUnsyncedEvents()).resolves.toBe(0);
  });

  it('sends the event name and props, and nothing else', async () => {
    await seed(1);
    const insert = ok();

    await flushEvents(USER, { client: fakeClient(insert) });

    expect(insert.mock.calls[0]![0][0]).toEqual({
      id: 'e0',
      user_id: USER,
      name: 'share_completed',
      props: { surface: 'card' },
      created_at: expect.any(String),
    });
  });

  it('keeps events queued when the push fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seed(2);
    const insert: InsertMock = jest.fn(async (_rows: WireRow[]) => ({
      error: { message: 'offline' } as unknown,
    }));

    await expect(flushEvents(USER, { client: fakeClient(insert) })).resolves.toBe(0);

    await expect(countUnsyncedEvents()).resolves.toBe(2);
  });

  // A row the server already has is not a failure to retry forever.
  it('drops a row the server reports as a duplicate', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seed(1);
    const insert: InsertMock = jest.fn(async (_rows: WireRow[]) => ({
      error: { code: '23505' } as unknown,
    }));

    await flushEvents(USER, { client: fakeClient(insert) });

    await expect(countUnsyncedEvents()).resolves.toBe(0);
  });

  it('falls back to per-row when the batch fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seed(3);
    let call = 0;
    const insert: InsertMock = jest.fn(async (rows: WireRow[]) => {
      call += 1;
      // First call is the batch; the rest are the per-row retries.
      if (call === 1) return { error: { message: 'batch too big' } as unknown };
      return rows[0]!.id === 'e1'
        ? { error: { message: 'bad row' } as unknown }
        : { error: null as unknown };
    });

    await expect(flushEvents(USER, { client: fakeClient(insert) })).resolves.toBe(2);

    // The one bad row stays for the next sweep; the good ones are gone.
    await expect(countUnsyncedEvents()).resolves.toBe(1);
  });

  it.each([
    ['a guest', LOCAL_GUEST_USER_ID],
    ['no user', null],
  ])('sends nothing for %s', async (_label, userId) => {
    await seed(2);
    const insert = ok();

    await expect(
      flushEvents(userId, { client: fakeClient(insert) }),
    ).resolves.toBe(0);

    expect(insert).not.toHaveBeenCalled();
    await expect(countUnsyncedEvents()).resolves.toBe(2);
  });

  // The regression: the read was unscoped, so after sign-in the oldest rows
  // in the queue were a guest's (or a previous account's). The server refuses
  // every one of those under RLS, refused rows stay queued, and oldest-first
  // meant the same unsendable batch came back on every sweep — this user's
  // own events never went out.
  it("sends only this user's events, even behind a full batch of someone else's", async () => {
    for (let i = 0; i < 150; i++) {
      await enqueueEvent({
        id: `other${i}`,
        user_id: 'someone-else',
        name: 'share_completed',
        props: { surface: 'card' },
        created_at: new Date(1_600_000_000_000 + i * 1000).toISOString(),
      });
    }
    await seed(3);
    const insert = ok();

    await expect(
      flushEvents(USER, { client: fakeClient(insert) }),
    ).resolves.toBe(3);

    const sent = insert.mock.calls.flatMap((c) => c[0]);
    expect(sent.map((r) => r.user_id)).toEqual([USER, USER, USER]);
    // Another owner's rows are left for that owner, not deleted.
    await expect(countUnsyncedEvents()).resolves.toBe(150);
  });

  it('sends nothing when the user has opted out', async () => {
    await seed(2);
    useSettingsStore.setState({ analyticsEnabled: false });
    const insert = ok();

    await expect(flushEvents(USER, { client: fakeClient(insert) })).resolves.toBe(0);

    expect(insert).not.toHaveBeenCalled();
  });

  it('does nothing with an empty queue', async () => {
    const insert = ok();
    await expect(flushEvents(USER, { client: fakeClient(insert) })).resolves.toBe(0);
    expect(insert).not.toHaveBeenCalled();
  });

  it('sends nothing when Supabase is unavailable', async () => {
    await seed(1);
    await expect(flushEvents(USER, { client: null })).resolves.toBe(0);
    await expect(countUnsyncedEvents()).resolves.toBe(1);
  });

  // Startup and foreground can fire together; two sweeps would push twice.
  it('coalesces concurrent sweeps', async () => {
    await seed(2);
    const insert = ok();
    const client = fakeClient(insert);

    const [a, b] = await Promise.all([
      flushEvents(USER, { client }),
      flushEvents(USER, { client }),
    ]);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
});
