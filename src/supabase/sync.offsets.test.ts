// The one-time UTC offset backfill (review round 6, 2026-11-19): rows pushed
// while UTC_OFFSET_SYNC was off reached the server without their offsets.
// With the flag on, a sweep sends just those offsets, update-only, one row and
// one column a request, filling a server column only while it is null and only
// for the same moment, never inserting, never moving `updated_at`, at most 200
// requests a sweep, and marks the job done once every row has gone. A
// whole-row re-push was rejected: it could put back predictions deleted on
// another phone and write an older copy over a newer one.
//
// The three db helpers (listOffsetBackfill, offsetBackfillDone,
// markOffsetBackfillDone) are stood in for here so each case sets exactly the
// rows it needs; the last case runs them for real against the test database.
// The flag is read through a getter, since sync reads it on each call.

import type { SupabaseClient } from '@supabase/supabase-js';

import { getDb, setDbForTests } from '@/db/client';
import { LOCAL_GUEST_USER_ID } from '@/db/migrateGuestData';
import {
  getPredictionUpdatedAt,
  insertPrediction,
  markPredictionSynced,
  offsetBackfillDone,
} from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import type { OffsetBackfillRow, Prediction } from '@/types';

import {
  __resetSyncStateForTests,
  backfillOffsets,
  OFFSET_BACKFILL_BATCH_ROWS,
  OFFSET_BACKFILL_MAX_REQUESTS,
  pushNow,
  stopSyncFor,
  syncNow,
  type CursorStore,
  type SyncDeps,
} from './sync';

let mockOffsetSync = true;
// A getter defined on the object, not in a spread literal: Babel compiles a
// spread literal to Object.assign, which reads a getter once, at mock time.
jest.mock('@/constants/app', () =>
  Object.defineProperty({ ...jest.requireActual('@/constants/app') }, 'UTC_OFFSET_SYNC', {
    enumerable: true,
    get: () => mockOffsetSync,
  }),
);

/** True: the three backfill helpers run for real, against the test database. */
let mockUseRealDb = false;
const mockListOffsetBackfill = jest.fn();
const mockOffsetBackfillDone = jest.fn();
const mockMarkOffsetBackfillDone = jest.fn();
jest.mock('@/db/predictions', () => {
  const actual = jest.requireActual('@/db/predictions');
  return {
    ...actual,
    listOffsetBackfill: (userId: string) =>
      mockUseRealDb ? actual.listOffsetBackfill(userId) : mockListOffsetBackfill(userId),
    offsetBackfillDone: (userId: string) =>
      mockUseRealDb ? actual.offsetBackfillDone(userId) : mockOffsetBackfillDone(userId),
    markOffsetBackfillDone: (userId: string) =>
      mockUseRealDb ? actual.markOffsetBackfillDone(userId) : mockMarkOffsetBackfillDone(userId),
  };
});

const USER = 'user-aaa';
const OTHER = 'user-bbb';
const NEW_YORK = -300;
const BERLIN = 60;
const SERVER_UPDATED_AT = '2026-11-01T00:00:00.000Z';

/** A row as `listOffsetBackfill` lists it: a logging offset, no rewording. */
const row = (i: number, over: Partial<OffsetBackfillRow> = {}): OffsetBackfillRow => ({
  id: `p-${String(i).padStart(4, '0')}`,
  created_at: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
  created_utc_offset_min: NEW_YORK,
  title_edited_at: null,
  title_edited_utc_offset_min: null,
  ...over,
});

interface ServerRow {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  created_utc_offset_min: number | null;
  title_edited_at: string | null;
  title_edited_utc_offset_min: number | null;
  updated_at: string;
}

/** The server's copy of `r` as a push before the flag left it: same moments, no offsets. */
const serverCopy = (r: OffsetBackfillRow, over: Partial<ServerRow> = {}): ServerRow => ({
  id: r.id,
  user_id: USER,
  status: 'pending',
  created_at: r.created_at,
  created_utc_offset_min: null,
  title_edited_at: r.title_edited_at,
  title_edited_utc_offset_min: null,
  updated_at: SERVER_UPDATED_AT,
  ...over,
});

type Filter = [op: 'eq' | 'is', column: string, value: unknown];

interface UpdateCall {
  table: string;
  values: Record<string, unknown>;
  filters: Filter[];
  /** Whose session sent it. */
  session: string | null;
}

interface Answer {
  error: { code?: string; message: string } | null;
  status: number;
}

/**
 * An instant in microseconds, as Postgres compares timestamptz: '…00.12+00:00'
 * and '…00.120Z' are equal. NaN (never equal) for anything else.
 */
function micros(iso: string): number {
  const m = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(iso);
  if (!m) return Number.NaN;
  return Date.parse(`${m[1]}${m[3]}`) * 1000 + Number((m[2] ?? '').padEnd(6, '0'));
}

const MOMENTS = new Set(['created_at', 'title_edited_at']);

/**
 * A server holding `rows`. An update applies its filters as PostgREST and
 * Postgres would (row-level security on the session that sent it, `is null`,
 * moments compared as instants) and writes only the columns it names. `answer`
 * may answer a request instead (called before it is sent, with how many went
 * before it), and may change the session.
 */
function fakeServer(
  opts: { rows?: ServerRow[]; answer?: (call: UpdateCall, n: number) => Answer | void } = {},
) {
  const rows = new Map((opts.rows ?? []).map((r) => [r.id, { ...r }]));
  const updates: UpdateCall[] = [];
  const otherWrites: string[] = [];
  const state = { session: USER as string | null };

  const matches = (r: ServerRow, filters: Filter[]) =>
    filters.every(([op, column, value]) => {
      const have = (r as unknown as Record<string, unknown>)[column];
      if (op === 'is') return have === value;
      if (MOMENTS.has(column)) {
        return typeof have === 'string' && typeof value === 'string' && micros(have) === micros(value);
      }
      return have === value;
    });

  const pullChain = () => {
    const q = {
      eq: () => q,
      gt: () => q,
      order: () => q,
      in: async () => ({ data: [], error: null }),
      limit: async () => ({ data: [], error: null }),
    };
    return q;
  };

  const from = (table: string) => ({
    update(values: Record<string, unknown>) {
      const call: UpdateCall = { table, values, filters: [], session: null };
      const q = {
        eq(column: string, value: unknown) {
          call.filters.push(['eq', column, value]);
          return q;
        },
        is(column: string, value: unknown) {
          call.filters.push(['is', column, value]);
          return q;
        },
        then(resolve: (a: unknown) => unknown, reject?: (e: unknown) => unknown) {
          try {
            const scripted = opts.answer?.(call, updates.length);
            call.session = state.session;
            updates.push(call);
            if (scripted) return Promise.resolve({ ...scripted, data: null }).then(resolve, reject);
            for (const r of rows.values()) {
              if (r.user_id !== call.session) continue; // RLS: another account's rows aren't there
              if (!matches(r, call.filters)) continue;
              Object.assign(r, values);
            }
            return Promise.resolve({ error: null, status: 204, data: null }).then(resolve, reject);
          } catch (e) {
            return Promise.reject(e).then(resolve, reject);
          }
        },
      };
      return q;
    },
    upsert() {
      otherWrites.push('upsert');
      return Promise.resolve({ error: null });
    },
    insert() {
      otherWrites.push('insert');
      return Promise.resolve({ error: null });
    },
    delete() {
      otherWrites.push('delete');
      const q = { eq: () => q, or: () => q, select: async () => ({ data: [], error: null }) };
      return q;
    },
    select: () => pullChain(),
  });

  const client = {
    from,
    auth: {
      getSession: async () => ({
        data: { session: state.session ? { user: { id: state.session } } : null },
        error: null,
      }),
    },
  } as unknown as SupabaseClient;

  return { client, rows, updates, otherWrites, state };
}

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

const depsFor = (client: SupabaseClient): SyncDeps => ({
  client,
  cursorStore: cursorStore(),
  recompute: async () => undefined,
});

/** Every request names one offset column and nothing else: never `updated_at`. */
function expectOffsetsOnly(updates: UpdateCall[]): void {
  for (const u of updates) {
    expect(u.table).toBe('predictions');
    expect(Object.keys(u.values)).toHaveLength(1);
    expect(['created_utc_offset_min', 'title_edited_utc_offset_min']).toContain(
      Object.keys(u.values)[0],
    );
    expect(u.values).not.toHaveProperty('updated_at');
  }
}

const idsOf = (updates: UpdateCall[]) =>
  updates.map((u) => u.filters.find(([, column]) => column === 'id')?.[2]);

let listed: OffsetBackfillRow[] = [];
let markedDone = false;
let warn: jest.SpyInstance;

beforeEach(async () => {
  setDbForTests(await createTestDb());
  __resetSyncStateForTests();
  mockOffsetSync = true;
  mockUseRealDb = false;
  listed = [];
  markedDone = false;
  mockListOffsetBackfill.mockReset().mockImplementation(async () => listed);
  mockOffsetBackfillDone.mockReset().mockImplementation(async () => markedDone);
  mockMarkOffsetBackfillDone.mockReset().mockImplementation(async () => {
    markedDone = true;
  });
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  setDbForTests(null);
  __resetSyncStateForTests();
  jest.restoreAllMocks();
});

describe('with UTC_OFFSET_SYNC off', () => {
  it('a sweep sends nothing and reads no backfill state', async () => {
    mockOffsetSync = false;
    listed = [row(0)];
    const { client, updates, otherWrites, rows } = fakeServer({ rows: [serverCopy(row(0))] });

    await syncNow(USER, depsFor(client));
    await expect(backfillOffsets(USER, client, async () => true)).resolves.toEqual({
      sent: 0,
      done: false,
    });

    expect(updates).toEqual([]);
    expect(otherWrites).toEqual([]);
    expect(mockListOffsetBackfill).not.toHaveBeenCalled();
    expect(mockOffsetBackfillDone).not.toHaveBeenCalled();
    expect(mockMarkOffsetBackfillDone).not.toHaveBeenCalled();
    expect(rows.get(row(0).id)?.created_utc_offset_min).toBeNull();
  });
});

describe('with UTC_OFFSET_SYNC on', () => {
  it('sends update-only requests with exactly the agreed filters, and never an insert or upsert', async () => {
    const logged = row(0);
    const reworded = row(1, {
      created_utc_offset_min: BERLIN,
      title_edited_at: '2026-11-02T08:30:00.000Z',
      title_edited_utc_offset_min: NEW_YORK,
    });
    listed = [logged, reworded];
    const server = fakeServer({ rows: [serverCopy(logged), serverCopy(reworded)] });

    await syncNow(USER, depsFor(server.client));

    expect(server.updates.map(({ values, filters }) => ({ values, filters }))).toEqual([
      {
        values: { created_utc_offset_min: NEW_YORK },
        filters: [
          ['eq', 'id', logged.id],
          ['eq', 'user_id', USER],
          ['is', 'created_utc_offset_min', null],
          ['eq', 'created_at', logged.created_at],
        ],
      },
      {
        values: { created_utc_offset_min: BERLIN },
        filters: [
          ['eq', 'id', reworded.id],
          ['eq', 'user_id', USER],
          ['is', 'created_utc_offset_min', null],
          ['eq', 'created_at', reworded.created_at],
        ],
      },
      {
        values: { title_edited_utc_offset_min: NEW_YORK },
        filters: [
          ['eq', 'id', reworded.id],
          ['eq', 'user_id', USER],
          ['is', 'title_edited_utc_offset_min', null],
          ['eq', 'title_edited_at', reworded.title_edited_at],
        ],
      },
    ]);
    expectOffsetsOnly(server.updates);
    expect(server.otherWrites).toEqual([]);

    // Filled, and the server's updated_at didn't move: no phone pulls again.
    expect(server.rows.get(logged.id)).toEqual({
      ...serverCopy(logged),
      created_utc_offset_min: NEW_YORK,
    });
    expect(server.rows.get(reworded.id)).toEqual({
      ...serverCopy(reworded),
      created_utc_offset_min: BERLIN,
      title_edited_utc_offset_min: NEW_YORK,
    });
    expect(mockMarkOffsetBackfillDone).toHaveBeenCalledTimes(1);
    expect(mockMarkOffsetBackfillDone).toHaveBeenCalledWith(USER);
  });

  it('a rewording offset goes only when both the date and the offset are known here', async () => {
    listed = [
      row(0, { created_utc_offset_min: null, title_edited_at: '2026-11-02T08:30:00.000Z', title_edited_utc_offset_min: BERLIN }),
      row(1, { title_edited_at: '2026-11-02T08:30:00.000Z', title_edited_utc_offset_min: null }),
      row(2, { title_edited_at: null, title_edited_utc_offset_min: BERLIN }),
    ];
    const server = fakeServer({ rows: listed.map((r) => serverCopy(r)) });

    await backfillOffsets(USER, server.client, async () => true);

    expect(server.updates.map((u) => [idsOf([u])[0], Object.keys(u.values)[0]])).toEqual([
      [listed[0].id, 'title_edited_utc_offset_min'],
      [listed[1].id, 'created_utc_offset_min'],
      [listed[2].id, 'created_utc_offset_min'],
    ]);
  });

  it('never overwrites an offset the server holds, nor fills one for another moment', async () => {
    const r = row(0, {
      title_edited_at: '2026-11-02T08:30:00.000Z',
      title_edited_utc_offset_min: NEW_YORK,
    });
    listed = [r];
    // Another phone already sent the logging offset, and reworded it since.
    const server = fakeServer({
      rows: [
        serverCopy(r, {
          created_utc_offset_min: BERLIN,
          title_edited_at: '2026-11-03T10:00:00.000Z',
        }),
      ],
    });

    await syncNow(USER, depsFor(server.client));

    expect(server.updates).toHaveLength(2);
    expect(server.rows.get(r.id)).toEqual(
      serverCopy(r, { created_utc_offset_min: BERLIN, title_edited_at: '2026-11-03T10:00:00.000Z' }),
    );
    expect(server.otherWrites).toEqual([]);
  });

  it('a row deleted on another phone (none on the server) is a no-op: nothing is inserted', async () => {
    const kept = row(0);
    const deletedElsewhere = row(1);
    listed = [kept, deletedElsewhere];
    const server = fakeServer({ rows: [serverCopy(kept)] });

    await syncNow(USER, depsFor(server.client));

    expect(idsOf(server.updates)).toEqual([kept.id, deletedElsewhere.id]);
    expect(server.rows.has(deletedElsewhere.id)).toBe(false);
    expect([...server.rows.keys()]).toEqual([kept.id]);
    expect(server.otherWrites).toEqual([]);
    expect(mockMarkOffsetBackfillDone).toHaveBeenCalledTimes(1);
  });

  it('sends each moment as stored: the server compares instants, whatever the format', async () => {
    // A row pulled from the server keeps the server's writing of its time.
    const pulled = row(0, { created_at: '2026-11-18T14:00:00.12+00:00' });
    const fine = row(1, { created_at: '2026-11-18T14:00:00.123456+00:00' });
    listed = [pulled, fine];
    const server = fakeServer({
      rows: [
        serverCopy(pulled, { created_at: '2026-11-18T14:00:00.120Z' }),
        serverCopy(fine),
      ],
    });

    await backfillOffsets(USER, server.client, async () => true);

    // Not re-written through Date, which would cut the microseconds.
    expect(server.updates.map((u) => u.filters[3])).toEqual([
      ['eq', 'created_at', '2026-11-18T14:00:00.12+00:00'],
      ['eq', 'created_at', '2026-11-18T14:00:00.123456+00:00'],
    ]);
    expect(server.rows.get(pulled.id)?.created_utc_offset_min).toBe(NEW_YORK);
    expect(server.rows.get(fine.id)?.created_utc_offset_min).toBe(NEW_YORK);
  });

  it('sends nothing for a moment with no zone of its own or an offset out of range, and still finishes', async () => {
    listed = [
      row(0, { created_at: '2026-11-18 14:00:00' }),
      row(1, { created_at: 'yesterday' }),
      row(2, { created_utc_offset_min: 900 }),
      row(3, { created_utc_offset_min: 12.5 }),
    ];
    const server = fakeServer({ rows: listed.map((r) => serverCopy(r)) });

    await expect(backfillOffsets(USER, server.client, async () => true)).resolves.toEqual({
      sent: 0,
      done: true,
    });
    expect(server.updates).toEqual([]);
  });

  it('nothing to send: done at once', async () => {
    const server = fakeServer();
    await expect(backfillOffsets(USER, server.client, async () => true)).resolves.toEqual({
      sent: 0,
      done: true,
    });
    expect(mockMarkOffsetBackfillDone).toHaveBeenCalledTimes(1);
  });

  it('sends at most 200 requests a sweep and goes on from there at the next, then marks done once', async () => {
    expect(OFFSET_BACKFILL_MAX_REQUESTS).toBe(200);
    // 150 rows with both offsets: 300 requests.
    listed = Array.from({ length: 150 }, (_, i) =>
      row(i, { title_edited_at: '2026-11-02T08:30:00.000Z', title_edited_utc_offset_min: BERLIN }),
    );
    const server = fakeServer({ rows: listed.map((r) => serverCopy(r)) });
    const deps = depsFor(server.client);

    await syncNow(USER, deps);
    const first = server.updates.splice(0);
    expect(first).toHaveLength(200);
    expect(new Set(idsOf(first))).toEqual(new Set(listed.slice(0, 100).map((r) => r.id)));
    expect(mockMarkOffsetBackfillDone).not.toHaveBeenCalled();

    await syncNow(USER, deps);
    const second = server.updates.splice(0);
    expect(second).toHaveLength(100);
    // No row sent again.
    expect(new Set(idsOf(second))).toEqual(new Set(listed.slice(100).map((r) => r.id)));
    expect(mockMarkOffsetBackfillDone).toHaveBeenCalledTimes(1);
    for (const r of listed) {
      expect(server.rows.get(r.id)).toEqual({
        ...serverCopy(r),
        created_utc_offset_min: NEW_YORK,
        title_edited_utc_offset_min: BERLIN,
      });
    }

    // Done: a later sweep doesn't even list the rows.
    mockListOffsetBackfill.mockClear();
    await syncNow(USER, deps);
    expect(server.updates).toEqual([]);
    expect(mockListOffsetBackfill).not.toHaveBeenCalled();
    expect(mockMarkOffsetBackfillDone).toHaveBeenCalledTimes(1);
    expectOffsetsOnly(first.concat(second));
    expect(server.otherWrites).toEqual([]);
  });

  it('checks the session before the first batch and after each one', async () => {
    expect(OFFSET_BACKFILL_BATCH_ROWS).toBe(25);
    listed = Array.from({ length: 60 }, (_, i) => row(i));
    const server = fakeServer({ rows: listed.map((r) => serverCopy(r)) });
    const stillCurrent = jest.fn(async () => true);

    await expect(backfillOffsets(USER, server.client, stillCurrent)).resolves.toEqual({
      sent: 60,
      done: true,
    });
    // Before the first, then after the batches of 25, 25 and 10.
    expect(stillCurrent).toHaveBeenCalledTimes(4);
  });

  it('a session that is no longer this account\'s at the start sends nothing', async () => {
    listed = [row(0)];
    const server = fakeServer({ rows: [serverCopy(row(0))] });
    await expect(backfillOffsets(USER, server.client, async () => false)).resolves.toEqual({
      sent: 0,
      done: false,
    });
    expect(server.updates).toEqual([]);
    expect(mockMarkOffsetBackfillDone).not.toHaveBeenCalled();
  });

  it('stops on an account change, counts nothing from that batch, and sends it again later', async () => {
    listed = Array.from({ length: 30 }, (_, i) => row(i));
    let switched = false;
    const server = fakeServer({
      rows: listed.map((r) => serverCopy(r)),
      // Another account signs in while the tenth request goes (once).
      answer: (_call, n) => {
        if (n === 9 && !switched) {
          switched = true;
          server.state.session = OTHER;
        }
      },
    });
    const deps = depsFor(server.client);

    await syncNow(USER, deps);
    // The first batch went (25 requests); the session read after it is
    // another account's, so the batch isn't counted and no more go.
    expect(server.updates).toHaveLength(OFFSET_BACKFILL_BATCH_ROWS);
    expect(server.updates.slice(9).every((u) => u.session === OTHER)).toBe(true);
    // Under the other session, row-level security matched nothing.
    expect(listed.filter((r) => server.rows.get(r.id)?.created_utc_offset_min === NEW_YORK)).toHaveLength(9);
    expect(mockMarkOffsetBackfillDone).not.toHaveBeenCalled();

    // Back to this account: every row goes again (the nine filled are no-ops).
    server.state.session = USER;
    server.updates.splice(0);
    await syncNow(USER, deps);
    expect(server.updates).toHaveLength(30);
    expect(listed.every((r) => server.rows.get(r.id)?.created_utc_offset_min === NEW_YORK)).toBe(true);
    expect(mockMarkOffsetBackfillDone).toHaveBeenCalledTimes(1);
    expect(server.otherWrites).toEqual([]);
  });

  it("a refusal of one row (PT429) doesn't stop the others or mark done; that row goes again next sweep", async () => {
    listed = Array.from({ length: 5 }, (_, i) => row(i));
    let refuse = true;
    const server = fakeServer({
      rows: listed.map((r) => serverCopy(r)),
      answer: (call) =>
        refuse && idsOf([call])[0] === listed[2].id
          ? { error: { code: 'PT429', message: 'predictions: an account holds at most 50000 predictions' }, status: 429 }
          : undefined,
    });
    const deps = depsFor(server.client);

    await syncNow(USER, deps);
    expect(idsOf(server.updates)).toEqual(listed.map((r) => r.id));
    expect(listed.map((r) => server.rows.get(r.id)?.created_utc_offset_min)).toEqual([
      NEW_YORK,
      NEW_YORK,
      null,
      NEW_YORK,
      NEW_YORK,
    ]);
    expect(mockMarkOffsetBackfillDone).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[sync] offset backfill: 1 request(s) refused (PT429); tried again at the next sweep',
    );

    refuse = false;
    server.updates.splice(0);
    await syncNow(USER, deps);
    expect(idsOf(server.updates)).toEqual([listed[2].id]);
    expect(server.rows.get(listed[2].id)?.created_utc_offset_min).toBe(NEW_YORK);
    expect(mockMarkOffsetBackfillDone).toHaveBeenCalledTimes(1);
  });

  it('a row half sent (one of its two refused) goes whole again; the filled column is a no-op', async () => {
    const r = row(0, { title_edited_at: '2026-11-02T08:30:00.000Z', title_edited_utc_offset_min: BERLIN });
    listed = [r];
    let refuse = true;
    const server = fakeServer({
      rows: [serverCopy(r)],
      answer: (call) =>
        refuse && 'title_edited_utc_offset_min' in call.values
          ? { error: { code: '57014', message: 'canceling statement due to statement timeout' }, status: 400 }
          : undefined,
    });

    await expect(backfillOffsets(USER, server.client, async () => true)).resolves.toEqual({
      sent: 2,
      done: false,
    });
    refuse = false;
    server.updates.splice(0);
    await expect(backfillOffsets(USER, server.client, async () => true)).resolves.toEqual({
      sent: 2,
      done: true,
    });
    expect(server.rows.get(r.id)).toEqual({
      ...serverCopy(r),
      created_utc_offset_min: NEW_YORK,
      title_edited_utc_offset_min: BERLIN,
    });
  });

  it('a transport error stops the sweep without marking done; the next sweep goes on from the row that failed', async () => {
    listed = Array.from({ length: 5 }, (_, i) => row(i));
    let offline = true;
    const server = fakeServer({
      rows: listed.map((r) => serverCopy(r)),
      // postgrest-js's answer when fetch itself fails.
      answer: (_call, n) =>
        offline && n === 1
          ? { error: { code: '', message: 'TypeError: Network request failed' }, status: 0 }
          : undefined,
    });
    const deps = depsFor(server.client);

    await syncNow(USER, deps);
    expect(idsOf(server.updates)).toEqual([listed[0].id, listed[1].id]);
    expect(mockMarkOffsetBackfillDone).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[sync] offset backfill paused (network); it goes on at the next sweep',
    );

    offline = false;
    server.updates.splice(0);
    await syncNow(USER, deps);
    expect(idsOf(server.updates)).toEqual(listed.slice(1).map((r) => r.id));
    expect(mockMarkOffsetBackfillDone).toHaveBeenCalledTimes(1);
  });

  it('a gateway error with no code (a 503 page) stops the sweep too', async () => {
    listed = Array.from({ length: 3 }, (_, i) => row(i));
    const server = fakeServer({
      rows: listed.map((r) => serverCopy(r)),
      answer: () => ({ error: { message: '<html>Service Unavailable</html>' }, status: 503 }),
    });
    await expect(backfillOffsets(USER, server.client, async () => true)).resolves.toEqual({
      sent: 1,
      done: false,
    });
    expect(warn).toHaveBeenCalledWith(
      '[sync] offset backfill paused (HTTP 503); it goes on at the next sweep',
    );
  });

  it('a server without the columns yet (PGRST204) stops at the first request', async () => {
    listed = Array.from({ length: 10 }, (_, i) => row(i));
    const server = fakeServer({
      rows: listed.map((r) => serverCopy(r)),
      answer: () => ({
        error: {
          code: 'PGRST204',
          message: "Could not find the 'created_utc_offset_min' column of 'predictions' in the schema cache",
        },
        status: 400,
      }),
    });

    await syncNow(USER, depsFor(server.client));
    expect(server.updates).toHaveLength(1);
    expect(mockMarkOffsetBackfillDone).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[sync] offset backfill paused (PGRST204); it goes on at the next sweep',
    );
  });

  it('logs only codes and counts: no id, time, offset or server message', async () => {
    const r = row(0, { title_edited_at: '2026-11-02T08:30:00.000Z', title_edited_utc_offset_min: BERLIN });
    listed = [r, row(1)];
    const server = fakeServer({
      rows: listed.map((x) => serverCopy(x)),
      answer: (call) =>
        idsOf([call])[0] === r.id
          ? {
              error: {
                code: '23514',
                message: `new row violates check constraint; ${r.id} ${r.created_at} ${NEW_YORK}`,
              },
              status: 400,
            }
          : { error: { code: '', message: `TypeError: failed for ${listed[1].id}` }, status: 0 },
    });

    await syncNow(USER, depsFor(server.client));
    const text = warn.mock.calls.flat().map(String).join('\n');
    expect(text).toContain('23514');
    for (const secret of [r.id, listed[1].id, r.created_at, r.title_edited_at!, String(NEW_YORK), String(BERLIN), 'violates', 'TypeError']) {
      expect(text).not.toContain(secret);
    }
  });

  it('stops for an account being taken off the phone, and writes no marker', async () => {
    listed = Array.from({ length: 10 }, (_, i) => row(i));
    const server = fakeServer({
      rows: listed.map((r) => serverCopy(r)),
      answer: (_call, n) => {
        if (n === 3) void stopSyncFor(USER, 0);
      },
    });

    await syncNow(USER, depsFor(server.client));
    expect(server.updates).toHaveLength(4);
    expect(mockMarkOffsetBackfillDone).not.toHaveBeenCalled();
    // And no sweep starts for it now.
    server.updates.splice(0);
    await syncNow(USER, depsFor(server.client));
    expect(server.updates).toEqual([]);
  });

  it("yields to sign-out's push, which then runs, and goes on at the next sweep", async () => {
    listed = Array.from({ length: 30 }, (_, i) => row(i));
    let push: Promise<number> | null = null;
    const server = fakeServer({
      rows: listed.map((r) => serverCopy(r)),
      // Sign-out starts while the fifth request goes (once).
      answer: (_call, n) => {
        if (n === 4 && push === null) push = pushNow(USER, deps);
      },
    });
    const deps = depsFor(server.client);

    await syncNow(USER, deps);
    expect(server.updates).toHaveLength(5);
    expect(push).not.toBeNull();
    await expect(push).resolves.toBe(0);
    expect(mockMarkOffsetBackfillDone).not.toHaveBeenCalled();

    server.updates.splice(0);
    await syncNow(USER, deps);
    expect(idsOf(server.updates)).toEqual(listed.slice(5).map((r) => r.id));
    expect(mockMarkOffsetBackfillDone).toHaveBeenCalledTimes(1);
  });

  it('never for the guest or a signed-out phone', async () => {
    listed = [row(0)];
    const server = fakeServer({ rows: [serverCopy(row(0))] });

    await syncNow(LOCAL_GUEST_USER_ID, depsFor(server.client));
    await syncNow(null, depsFor(server.client));
    await expect(
      backfillOffsets(LOCAL_GUEST_USER_ID, server.client, async () => true),
    ).resolves.toEqual({ sent: 0, done: false });

    expect(server.updates).toEqual([]);
    expect(mockListOffsetBackfill).not.toHaveBeenCalled();
  });

  it("a failing read of this phone's state is logged and the sweep's result stands", async () => {
    mockOffsetBackfillDone.mockRejectedValueOnce(new Error('database is locked'));
    listed = [row(0)];
    const server = fakeServer({ rows: [serverCopy(row(0))] });

    await expect(syncNow(USER, depsFor(server.client))).resolves.toEqual({ pulled: 0, pushed: 0 });
    expect(server.updates).toEqual([]);
    expect(warn).toHaveBeenCalledWith('[sync] offset backfill failed:', 'database is locked');
  });

  it('with the real database helpers: sends what the rows hold, marks done, and leaves updated_at and dirty alone', async () => {
    mockUseRealDb = true;
    const base: Prediction = {
      id: 'a',
      user_id: USER,
      title: 'A secret title',
      category: 'work',
      confidence: 70,
      created_at: '2026-11-01T14:00:00.000Z',
      due_date: '2026-11-05T17:00:00.000Z',
      status: 'pending',
      resolved_at: null,
      reflection: null,
      integrity_bonus: false,
    };
    await insertPrediction({ ...base, id: 'a', created_utc_offset_min: NEW_YORK });
    await insertPrediction({
      ...base,
      id: 'b',
      created_at: '2026-11-02T14:00:00.000Z',
      created_utc_offset_min: BERLIN,
      title_edited_at: '2026-11-03T09:00:00.000Z',
      title_edited_utc_offset_min: BERLIN,
    });
    await insertPrediction({ ...base, id: 'c', created_at: '2026-11-03T14:00:00.000Z' });
    for (const id of ['a', 'b', 'c']) {
      await markPredictionSynced(id, (await getPredictionUpdatedAt(id)) as string);
    }
    const before = await getDb().all(`SELECT id, updated_at, dirty FROM predictions ORDER BY id`);
    const server = fakeServer({
      rows: [
        serverCopy(row(0, { id: 'a', created_at: base.created_at })),
        serverCopy(
          row(0, {
            id: 'b',
            created_at: '2026-11-02T14:00:00.000Z',
            title_edited_at: '2026-11-03T09:00:00.000Z',
          }),
        ),
        serverCopy(row(0, { id: 'c', created_at: '2026-11-03T14:00:00.000Z' })),
      ],
    });

    await syncNow(USER, depsFor(server.client));

    expect(idsOf(server.updates)).toEqual(['a', 'b', 'b']);
    expectOffsetsOnly(server.updates);
    expect(server.otherWrites).toEqual([]);
    expect(server.rows.get('a')?.created_utc_offset_min).toBe(NEW_YORK);
    expect(server.rows.get('b')?.created_utc_offset_min).toBe(BERLIN);
    expect(server.rows.get('b')?.title_edited_utc_offset_min).toBe(BERLIN);
    expect(server.rows.get('c')?.created_utc_offset_min).toBeNull();
    expect([...server.rows.values()].every((r) => r.updated_at === SERVER_UPDATED_AT)).toBe(true);
    expect(await getDb().all(`SELECT id, updated_at, dirty FROM predictions ORDER BY id`)).toEqual(before);
    expect(await offsetBackfillDone(USER)).toBe(true);

    server.updates.splice(0);
    await syncNow(USER, depsFor(server.client));
    expect(server.updates).toEqual([]);
  });
});
