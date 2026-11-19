import type { SupabaseClient } from '@supabase/supabase-js';

import { countUnsyncedEvents, enqueueEvent, listUnsyncedEvents } from '@/db/analytics';
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

/** supabase-js answers with the error and the HTTP status (0 for no response). */
type InsertMock = jest.Mock<Promise<{ error: unknown; status?: number }>, [WireRow[]]>;

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

  it('sends nothing for no user', async () => {
    await seed(2);
    const insert = ok();

    await expect(flushEvents(null, { client: fakeClient(insert) })).resolves.toBe(0);

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

// Security review, 2026-11-18, round 3: migration 010 refuses a guest insert
// of more than 100 rows (PT413) or past the table's day budget (PT429), and
// either table refuses a row that breaks a CHECK (23514). A refusal the
// server will repeat isn't retried row by row, and a row it can never take
// isn't kept.
describe('flushEvents: refusals the server will repeat', () => {
  const refusing = (error: Record<string, unknown>, status: number): InsertMock =>
    jest.fn(async (_rows: WireRow[]) => ({ error: error as unknown, status }));

  it.each([
    ['PT429, the day budget', { code: 'PT429', message: "today's budget is used up" }, 429],
    ['PT413, too many rows', { code: 'PT413', message: 'at most 100 rows per insert' }, 413],
    ['25006, a read-only database', { code: '25006', message: 'cannot execute INSERT in a read-only transaction' }, 405],
    ['HTTP 402 with no code', { message: 'Service restricted' }, 402],
    ['HTTP 429 with no code', { message: 'Too Many Requests' }, 429],
  ])('stops the sweep on %s, with one request and every row kept', async (_label, error, status) => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seed(3);
    const insert = refusing(error, status);

    await expect(flushEvents(USER, { client: fakeClient(insert) })).resolves.toBe(0);

    expect(insert).toHaveBeenCalledTimes(1);
    await expect(countUnsyncedEvents()).resolves.toBe(3);
  });

  it('stops mid-way when a row meets the day budget, keeping it and the rest', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seed(4);
    const insert: InsertMock = jest.fn(async (rows: WireRow[]) => {
      if (rows.length > 1) return { error: { code: '23514', message: 'violates check constraint' }, status: 400 };
      if (rows[0]!.id === 'e0') return { error: null, status: 201 };
      return { error: { code: 'PT429', message: "today's budget is used up" }, status: 429 };
    });

    await expect(flushEvents(USER, { client: fakeClient(insert) })).resolves.toBe(1);

    // The batch, e0, then e1 refused: e2 and e3 are never tried.
    expect(insert).toHaveBeenCalledTimes(3);
    const left = await listUnsyncedEvents(USER, 10);
    expect(left.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('drops a row that breaks a CHECK (23514), sends the rest, and logs only the code', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seed(3);
    const refusal = {
      code: '23514',
      message: 'new row for relation "analytics_events" violates check constraint "analytics_events_props_allowed"',
      details: `Failing row contains (e1, ${USER}, share_completed).`,
      hint: null,
    };
    const insert: InsertMock = jest.fn(async (rows: WireRow[]) =>
      rows.length > 1 || rows[0]!.id === 'e1'
        ? { error: refusal as unknown, status: 400 }
        : { error: null, status: 201 },
    );

    await expect(flushEvents(USER, { client: fakeClient(insert) })).resolves.toBe(2);

    await expect(countUnsyncedEvents()).resolves.toBe(0);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('23514');
    expect(logged).not.toContain('violates check constraint');
    expect(logged).not.toContain('Failing row');
    expect(logged).not.toContain(USER);
  });

  it.each([
    ['22P02', `invalid input syntax for type uuid: "${USER}"`],
    ['22007', 'invalid input syntax for type timestamp with time zone: "yesterday-ish"'],
    ['22008', 'date/time field value out of range: "2026-13-45T00:00:00Z"'],
  ])('drops a row refused with invalid input (%s), logging only the code', async (code, message) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seed(2);
    const insert: InsertMock = jest.fn(async (rows: WireRow[]) =>
      rows.length > 1 || rows[0]!.id === 'e0'
        ? { error: { code, message } as unknown, status: 400 }
        : { error: null, status: 201 },
    );

    await expect(flushEvents(USER, { client: fakeClient(insert) })).resolves.toBe(1);

    await expect(countUnsyncedEvents()).resolves.toBe(0);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain(code);
    expect(logged).not.toContain(message.slice(message.indexOf('"')));
  });

  it('keeps every row when there was no response at all', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seed(2);
    const insert = refusing({ code: '', message: 'TypeError: Network request failed' }, 0);

    await expect(flushEvents(USER, { client: fakeClient(insert) })).resolves.toBe(0);

    await expect(countUnsyncedEvents()).resolves.toBe(2);
  });

  it('keeps a row refused for any other reason, as before', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seed(2);
    const insert = refusing({ code: '42501', message: 'new row violates row-level security policy' }, 403);

    await expect(flushEvents(USER, { client: fakeClient(insert) })).resolves.toBe(0);

    await expect(countUnsyncedEvents()).resolves.toBe(2);
  });

  // Migration 010's ceiling: a guest insert of more than 100 rows is refused.
  it('never sends more than 100 rows in one insert', async () => {
    await seed(150);
    const insert = ok();

    await expect(flushEvents(USER, { client: fakeClient(insert) })).resolves.toBe(100);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]![0]).toHaveLength(100);
    await expect(countUnsyncedEvents()).resolves.toBe(50);
  });
});

// Roadmap D43 (decided 2026-11-03): a guest's funnel events count, with no id.
// Security review, 2026-11-18: release builds keep console.warn in the device
// log, and a Postgres error's details repeat the failing row.
describe('what a failed flush writes to the log', () => {
  it("carries the error's code and message, never its details or the row", async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seed(1);
    const error = {
      code: '23503',
      message: 'insert or update on table "analytics_events" violates foreign key constraint',
      details: `Key (user_id)=(${USER}) is not present in table "users".`,
      hint: null,
    };
    const insert = jest.fn(async (_rows: WireRow[]) => ({ error: error as unknown }));

    await flushEvents(USER, { client: fakeClient(insert) });

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('23503');
    expect(logged).toContain('violates foreign key constraint');
    expect(logged).not.toContain(USER);
    expect(logged).not.toContain('Key (user_id)');
  });

  it('logs only the message of a thrown error', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await seed(1);
    const insert = jest.fn(async (_rows: WireRow[]): Promise<{ error: unknown }> => {
      throw Object.assign(new Error('socket closed'), { details: `row of ${USER}` });
    });

    await flushEvents(USER, { client: fakeClient(insert) });

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('socket closed');
    expect(logged).not.toContain(USER);
  });
});

describe('flushEvents for a guest', () => {
  const tables: string[] = [];
  const guestClient = (insert: InsertMock): SupabaseClient =>
    ({
      from: (table: string) => {
        tables.push(table);
        return { insert };
      },
    }) as unknown as SupabaseClient;

  beforeEach(async () => {
    tables.length = 0;
    // The line about usage counts has been shown on this phone (D69 (b)).
    useSettingsStore.setState({ usageNoticeShownAt: '2026-11-19T09:00:00.000Z' });
    const events = [
      ['g1', 'warmup_started', {}],
      ['g2', 'warmup_completed', { score: 70, question_count: 10 }],
      ['g3', 'paywall_viewed', { source: 'settings' }],
      ['g4', 'share_completed', { surface: 'warmup' }],
    ] as const;
    for (const [id, name, props] of events) {
      await enqueueEvent({
        id,
        user_id: LOCAL_GUEST_USER_ID,
        name,
        props,
        created_at: new Date(1_700_000_000_000 + Number(id[1]) * 1000).toISOString(),
      });
    }
  });

  afterEach(() => useSettingsStore.setState({ usageNoticeShownAt: null }));

  it('sends only the funnel events, to their own table, with no id of any kind', async () => {
    const insert = ok();

    await expect(
      flushEvents(LOCAL_GUEST_USER_ID, { client: guestClient(insert) }),
    ).resolves.toBe(3);

    expect(tables).toEqual(['guest_analytics_events']);
    const sent = insert.mock.calls.flatMap((c) => c[0]);
    expect(sent.map((r) => r.name)).toEqual([
      'warmup_started',
      'warmup_completed',
      'share_completed',
    ]);
    for (const row of sent) {
      expect(Object.keys(row).sort()).toEqual(['created_at', 'id', 'name', 'props']);
    }
    // The paywall view waits for an account, as before.
    await expect(countUnsyncedEvents()).resolves.toBe(1);
  });

  it('sends nothing with usage stats off', async () => {
    const insert = ok();
    useSettingsStore.setState({ analyticsEnabled: false });
    await expect(
      flushEvents(LOCAL_GUEST_USER_ID, { client: guestClient(insert) }),
    ).resolves.toBe(0);
    expect(insert).not.toHaveBeenCalled();
    await expect(countUnsyncedEvents()).resolves.toBe(4);
  });

  // D69 (b), checked by the flush itself for any caller: nothing goes up from
  // a guest before the line about usage counts has been shown.
  it('sends nothing before the line about usage counts has been shown', async () => {
    const insert = ok();
    useSettingsStore.setState({ usageNoticeShownAt: null });

    await expect(
      flushEvents(LOCAL_GUEST_USER_ID, { client: guestClient(insert) }),
    ).resolves.toBe(0);

    expect(insert).not.toHaveBeenCalled();
    await expect(countUnsyncedEvents()).resolves.toBe(4);
  });

  // Migration 010 (security review, 2026-11-18, round 3).
  it.each([
    ['PT429', "guest_analytics_events: today's budget is used up; try again after midnight UTC", 429],
    ['PT413', 'guest_analytics_events: at most 100 rows per insert', 413],
  ])('stops on %s with one request and keeps the funnel events', async (code, message, status) => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const insert: InsertMock = jest.fn(async (_rows: WireRow[]) => ({
      error: { code, message, details: null, hint: null } as unknown,
      status,
    }));

    await expect(
      flushEvents(LOCAL_GUEST_USER_ID, { client: guestClient(insert) }),
    ).resolves.toBe(0);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(tables).toEqual(['guest_analytics_events']);
    await expect(countUnsyncedEvents()).resolves.toBe(4);
  });

  it("drops a funnel event the props rule refuses (23514), and sends the others", async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const insert: InsertMock = jest.fn(async (rows: WireRow[]) =>
      rows.length > 1 || rows[0]!.id === 'g2'
        ? {
            error: {
              code: '23514',
              message:
                'new row for relation "guest_analytics_events" violates check constraint "guest_analytics_events_props_allowed"',
            } as unknown,
            status: 400,
          }
        : { error: null, status: 201 },
    );

    await expect(
      flushEvents(LOCAL_GUEST_USER_ID, { client: guestClient(insert) }),
    ).resolves.toBe(2);

    // Only the paywall view is left: it waits for an account, as before.
    await expect(countUnsyncedEvents()).resolves.toBe(1);
  });
});
