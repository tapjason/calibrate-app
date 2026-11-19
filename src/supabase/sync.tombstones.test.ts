// Round 6, item 6, and round 7: a stale phone's deletion must not remove an
// answer given elsewhere. Phone A deletes its open copy of a prediction;
// phone B, which hadn't heard of the delete, has answered it. Before round 6,
// A's deletion went to the server first in every sweep (and in sign-out's
// push, which pulls nothing) and took B's answer off it for every phone; and
// A's pull skipped the answered row for good. Round 6 made the delete
// conditional on the row being open or answered no later than A's deletion,
// which still removed an answer B gave before A deleted its stale open copy
// (the review's round 7 blocker).
//
// Now each tombstone carries what this phone deleted (`deleted_status`,
// `deleted_resolved_at`), and the server delete removes only that row
// (`deletionMatch`): deleted open, only a row still open; deleted answered,
// only the same answer at the same time (or a row still open, which holds no
// answer). In the same statement, so no answer can land between a check and
// the delete. When it removes nothing, the row is read and handed to
// `reconcileTombstoneWithRemote` (src/db), which restores a row answered
// differently from what was deleted and drops the tombstone; the pull does
// the same. Real SQLite (the test database); a fake server that applies the
// delete's filter as PostgREST would.

import type { SupabaseClient } from '@supabase/supabase-js';

import { getDb, setDbForTests } from '@/db/client';
import {
  countUnsynced,
  deletePrediction,
  getPrediction,
  insertPrediction,
  isDeletedHere,
  listDeletions,
  listPendingDeletions,
  listPendingTombstonesSettled,
} from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import type { Prediction, PredictionWireRow } from '@/types';

import {
  __resetSyncStateForTests,
  deletionMatch,
  pullRemote,
  pushDeletions,
  pushNow,
  stopSyncFor,
  syncNow,
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

/** A minute after now: an answer given after this phone's deletion, which is stamped now. */
const afterTheDeletion = () => new Date(Date.now() + 60_000).toISOString();
/** Two days before now: an answer given before this phone's deletion, which is stamped now. */
const twoDaysBefore = () => new Date(Date.now() - 2 * 86_400_000).toISOString();
const longBefore = '2026-05-02T09:00:00.000Z';

/** The server's copy of p1, answered Yes at `resolvedAt` (or still open). */
const serverCopy = (
  resolvedAt: string | null,
  overrides: Partial<PredictionWireRow> = {},
): PredictionWireRow => ({
  ...prediction(),
  status: resolvedAt ? 'resolved_yes' : 'pending',
  resolved_at: resolvedAt,
  updated_at: resolvedAt ?? '2026-05-20T12:00:00.000Z',
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

/** An ISO time in microseconds, as Postgres compares timestamptz values. */
function instantMicros(iso: string): number {
  const fraction = (/\.(\d+)/.exec(iso)?.[1] ?? '').padEnd(6, '0').slice(0, 6);
  return Date.parse(iso.replace(/\.\d+/, '')) * 1000 + Number(fraction);
}

/**
 * The delete's condition, applied as PostgREST would: `status=eq.<s>`, or the
 * `or` filter `deletionMatch` builds for an answered deletion. Throws on any
 * other shape, and on a delete with no condition or two.
 */
function passesDelete(
  row: PredictionWireRow,
  status: unknown,
  orFilter: string | null,
): boolean {
  if ((status === undefined) === (orFilter === null)) {
    throw new Error('a delete must carry exactly one condition');
  }
  if (orFilter === null) return row.status === status;
  const match =
    /^status\.eq\.pending,and\(status\.eq\.(resolved_yes|resolved_no|skipped),resolved_at\.eq\."([^"]+)"\)$/.exec(
      orFilter,
    );
  if (!match) throw new Error(`unexpected filter: ${orFilter}`);
  if (row.status === 'pending') return true;
  return (
    row.status === match[1] &&
    row.resolved_at !== null &&
    instantMicros(row.resolved_at) === instantMicros(match[2])
  );
}

/**
 * A server holding `rows`, recording every request in order: `delete:<id>`
 * for each delete sent, `recheck` for a read of rows by id, `pull` for the
 * pull. `filtersSent` holds each delete's condition (`status=eq.pending`, or
 * `or=(…)`). `failRead` makes a read by id fail.
 */
function fakeServer(opts: { rows?: PredictionWireRow[]; failRead?: boolean } = {}) {
  const calls: string[] = [];
  const filtersSent: string[] = [];
  const held = new Map((opts.rows ?? []).map((r) => [r.id, r]));
  const from = () => ({
    select() {
      const filters: Record<string, unknown> = {};
      const q = {
        eq(col: string, val: unknown) {
          filters[col] = val;
          return q;
        },
        gt: () => q,
        order: () => q,
        limit: () => {
          calls.push('pull');
          return Promise.resolve({
            data: [...held.values()].filter((r) => r.user_id === filters.user_id),
            error: null,
          });
        },
        in: (_col: string, ids: string[]) => {
          calls.push('recheck');
          if (opts.failRead) return Promise.resolve({ data: null, error: { message: 'offline' } });
          return Promise.resolve({
            data: [...held.values()].filter((r) => ids.includes(r.id) && r.user_id === filters.user_id),
            error: null,
          });
        },
      };
      return q;
    },
    delete() {
      const filters: Record<string, unknown> = {};
      let orFilter: string | null = null;
      const q = {
        eq(col: string, val: unknown) {
          if (col !== 'id' && col !== 'user_id' && col !== 'status') {
            throw new Error(`unexpected delete filter on ${col}`);
          }
          filters[col] = val;
          return q;
        },
        or(filter: string) {
          orFilter = filter;
          return q;
        },
        select() {
          const id = String(filters.id);
          calls.push(`delete:${id}`);
          filtersSent.push(orFilter !== null ? `or=(${orFilter})` : `status=eq.${String(filters.status)}`);
          const row = held.get(id);
          if (row && row.user_id === filters.user_id && passesDelete(row, filters.status, orFilter)) {
            held.delete(id);
            return Promise.resolve({ data: [{ id }], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
      };
      return q;
    },
    upsert(rows: PredictionWireRow[]) {
      calls.push(`upsert:${rows.map((r) => r.id).join(',')}`);
      for (const r of rows) held.set(r.id, r);
      return Promise.resolve({ error: null });
    },
  });
  const client = {
    from,
    auth: { getSession: async () => ({ data: { session: { user: { id: USER } } }, error: null }) },
  } as unknown as SupabaseClient;
  return { client, calls, filtersSent, held };
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
  __resetSyncStateForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  setDbForTests(null);
  __resetSyncStateForTests();
  jest.restoreAllMocks();
});

/** p1 open here, then deleted here (now), the deletion not yet pushed. */
async function deletedHere(): Promise<void> {
  await insertPrediction(prediction());
  await deletePrediction('p1', { counted: true });
  expect(await listPendingDeletions(USER)).toEqual(['p1']);
}

/**
 * p1 answered here (`status` at `resolvedAt`), then deleted here (now), the
 * deletion not yet pushed: its tombstone keeps that answer (round 7).
 */
async function deletedHereAnswered(
  status: 'resolved_yes' | 'resolved_no' | 'skipped',
  resolvedAt: string,
): Promise<void> {
  await insertPrediction(prediction({ status, resolved_at: resolvedAt }));
  await deletePrediction('p1', { counted: true });
  expect(await listPendingTombstonesSettled(USER)).toEqual([
    expect.objectContaining({ id: 'p1', deleted_status: status, deleted_resolved_at: resolvedAt }),
  ]);
}

const always = async () => true;

// Round 7: replaces `openOrAnsweredBy` (round 6), whose filter let a delete
// remove any row answered no later than the deletion. Its two tests are
// carried over below: the time double-quoted and sent as written, and no
// filter built from a time that can't be read or would break out of the
// quotes (now such a tombstone counts as deleted open, and only an open row
// can go, where it used to send nothing).
describe('deletionMatch', () => {
  it('deleted open: only a row still open on the server', () => {
    expect(deletionMatch({ deleted_status: 'pending', deleted_resolved_at: null })).toEqual({
      kind: 'open',
    });
  });

  it('a tombstone from before the snapshot counts as deleted open', () => {
    expect(deletionMatch({})).toEqual({ kind: 'open' });
    expect(deletionMatch({ deleted_status: null, deleted_resolved_at: null })).toEqual({ kind: 'open' });
    expect(deletionMatch({ deleted_status: null, deleted_resolved_at: '2026-11-19T10:00:00.000Z' })).toEqual({
      kind: 'open',
    });
  });

  it('deleted answered: the same answer at the same time, or still open, the time double-quoted and sent as written', () => {
    expect(
      deletionMatch({ deleted_status: 'resolved_yes', deleted_resolved_at: '2026-11-19T10:00:00.000Z' }),
    ).toEqual({
      kind: 'answered',
      filter: 'status.eq.pending,and(status.eq.resolved_yes,resolved_at.eq."2026-11-19T10:00:00.000Z")',
    });
    expect(
      deletionMatch({ deleted_status: 'resolved_no', deleted_resolved_at: '2026-11-19T10:00:00+05:30' }),
    ).toEqual({
      kind: 'answered',
      filter: 'status.eq.pending,and(status.eq.resolved_no,resolved_at.eq."2026-11-19T10:00:00+05:30")',
    });
    // A time pulled from the server keeps its microseconds: re-written
    // through Date it would lose them, and match nothing.
    expect(
      deletionMatch({ deleted_status: 'skipped', deleted_resolved_at: '2026-11-19T10:00:00.123456+00:00' }),
    ).toEqual({
      kind: 'answered',
      filter: 'status.eq.pending,and(status.eq.skipped,resolved_at.eq."2026-11-19T10:00:00.123456+00:00")',
    });
  });

  it('builds no filter from a time it cannot read, or one that would break out of the quotes: deleted open', () => {
    for (const bad of [
      '',
      'soon',
      '2026-13-45T10:00:00.000Z',
      '2026-11-19T10:00:00.000Z"),id.neq.("',
      '2026-11-19T10:00:00.000Z),or(id.neq.x',
      '2026-11-19 10:00:00',
      null,
      undefined,
    ]) {
      expect(deletionMatch({ deleted_status: 'resolved_yes', deleted_resolved_at: bad })).toEqual({
        kind: 'open',
      });
    }
  });

  it('a status it does not know counts as deleted open, and never reaches the filter', () => {
    for (const status of ['resolved_maybe', 'resolved_yes,id.neq.x', '']) {
      expect(deletionMatch({ deleted_status: status, deleted_resolved_at: '2026-11-19T10:00:00.000Z' })).toEqual({
        kind: 'open',
      });
    }
  });
});

describe('the pull, for a row deleted here', () => {
  it('answered elsewhere after the deletion: restored, the tombstone dropped, counted as written', async () => {
    await deletedHere();
    const answeredAt = afterTheDeletion();
    const { client } = fakeServer({ rows: [serverCopy(answeredAt)] });

    await expect(pullRemote(USER, client, cursorStore())).resolves.toBe(1);
    const restored = await getPrediction('p1');
    expect(restored?.status).toBe('resolved_yes');
    expect(restored?.resolved_at).toBe(answeredAt);
    expect(await isDeletedHere('p1')).toBe(false);
    expect(await listDeletions(USER)).toEqual([]);
    // From the server: nothing to push back.
    expect(await countUnsynced(USER)).toBe(0);
  });

  // Round 7. Was 'answered before the deletion: the deletion stands' (0
  // written, p1 gone, its deletion still waiting): the rule that let the
  // delete remove that answer from the server. This phone deleted an open
  // copy; the answer the server holds was given elsewhere without knowing of
  // the delete, before it or after, so it stands.
  it('answered elsewhere before this phone deleted its open copy: restored, the tombstone dropped', async () => {
    await deletedHere();
    const { client } = fakeServer({ rows: [serverCopy(longBefore)] });
    await expect(pullRemote(USER, client, cursorStore())).resolves.toBe(1);
    expect(await getPrediction('p1')).toMatchObject({ status: 'resolved_yes', resolved_at: longBefore });
    expect(await isDeletedHere('p1')).toBe(false);
    expect(await countUnsynced(USER)).toBe(0);
  });

  it('deleted answered here, the same answer on the server: the deletion stands', async () => {
    await deletedHereAnswered('resolved_yes', longBefore);
    const { client } = fakeServer({ rows: [serverCopy(longBefore)] });
    await expect(pullRemote(USER, client, cursorStore())).resolves.toBe(0);
    expect(await getPrediction('p1')).toBeNull();
    expect(await listPendingDeletions(USER)).toEqual(['p1']);
  });

  it('still open on the server: the deletion stands, and the cursor moves on', async () => {
    await deletedHere();
    const store = cursorStore();
    const { client } = fakeServer({ rows: [serverCopy(null)] });
    await expect(pullRemote(USER, client, store)).resolves.toBe(0);
    expect(await getPrediction('p1')).toBeNull();
    expect(await isDeletedHere('p1')).toBe(true);
    expect(store.storage.get(USER)).toBe('2026-05-20T12:00:00.000Z');
  });

  it('writes nothing for an account that is leaving the phone', async () => {
    await deletedHere();
    const { client } = fakeServer({ rows: [serverCopy(afterTheDeletion())] });
    await stopSyncFor(USER);
    await expect(pullRemote(USER, client, cursorStore())).resolves.toBe(0);
    expect(await getPrediction('p1')).toBeNull();
    expect(await isDeletedHere('p1')).toBe(true);
  });
});

describe('the conditional delete', () => {
  // Round 7. Was "sends this phone's deletion time, double-quoted": the
  // filter was `status.eq.pending,resolved_at.lte."<deleted_at>"`. A
  // deletion of an open copy now asks for an open row and nothing else.
  it('deleted open: removes the row only while it is open on the server', async () => {
    await deletedHere();
    const { client, calls, filtersSent, held } = fakeServer({ rows: [serverCopy(null)] });

    await expect(pushDeletions(USER, client, always)).resolves.toBe(1);
    expect(calls).toEqual(['delete:p1']);
    expect(filtersSent).toEqual(['status=eq.pending']);
    expect(held.has('p1')).toBe(false);
    expect(await listPendingDeletions(USER)).toEqual([]);
    // The tombstone stays, pushed (D45).
    expect(await isDeletedHere('p1')).toBe(true);
  });

  // Round 7, the review's blocker. Was 'removes a row answered before the
  // deletion, as it always did' (resolves 1, nothing left on the server):
  // a phone that still held the prediction open, and deleted it, took off the
  // server an answer another phone had given before that delete, for every
  // phone. That answer was never this phone's to delete: it deleted an open
  // copy. Now nothing is removed, and the answer comes back here.
  it('never removes an answer given elsewhere before this phone deleted its open copy: read, restored here, the tombstone dropped', async () => {
    await deletedHere();
    const { client, calls, held } = fakeServer({ rows: [serverCopy(longBefore)] });
    await expect(pushDeletions(USER, client, always)).resolves.toBe(0);
    expect(calls).toEqual(['delete:p1', 'recheck']);
    expect(held.get('p1')).toMatchObject({ status: 'resolved_yes', resolved_at: longBefore });
    expect(await getPrediction('p1')).toMatchObject({ status: 'resolved_yes', resolved_at: longBefore });
    expect(await listPendingDeletions(USER)).toEqual([]);
    expect(await isDeletedHere('p1')).toBe(false);
  });

  it('two phones: B answered two days ago, A deletes its stale open copy later: nothing is removed on the server, and A restores the answer', async () => {
    // Phone A logged it and synced it; it is open here and on the server.
    await insertPrediction(prediction());
    // Phone B answered it two days ago; A never pulled since.
    const answeredOnB = twoDaysBefore();
    const onB = serverCopy(answeredOnB, { status: 'resolved_no', reflection: 'From phone B' });
    const { client, calls, held } = fakeServer({ rows: [onB] });
    // A deletes its stale open copy now (inside the day, uncounted or not).
    await deletePrediction('p1', { counted: true });
    expect(await listPendingDeletions(USER)).toEqual(['p1']);

    // A's next sweep: its deletion goes first.
    const recompute = jest.fn(async () => {});
    await syncNow(USER, { client, cursorStore: cursorStore(), recompute });

    // The server keeps B's answer, untouched, for every phone.
    expect(calls[0]).toBe('delete:p1');
    expect(calls[1]).toBe('recheck');
    expect(held.get('p1')).toEqual(onB);
    // A has it back as B answered it, with nothing left to push or delete.
    expect(await getPrediction('p1')).toMatchObject({
      status: 'resolved_no',
      resolved_at: answeredOnB,
      reflection: 'From phone B',
    });
    expect(await isDeletedHere('p1')).toBe(false);
    expect(await listDeletions(USER)).toEqual([]);
    expect(await countUnsynced(USER)).toBe(0);
    expect(recompute).toHaveBeenCalledWith(USER);
  });

  it('deleted answered here: removes the row with the same answer at the same time', async () => {
    const answeredAt = '2026-06-01T19:30:00.000Z';
    await deletedHereAnswered('resolved_yes', answeredAt);
    const { client, calls, filtersSent, held } = fakeServer({ rows: [serverCopy(answeredAt)] });

    await expect(pushDeletions(USER, client, always)).resolves.toBe(1);
    expect(calls).toEqual(['delete:p1']);
    expect(filtersSent).toEqual([
      `or=(status.eq.pending,and(status.eq.resolved_yes,resolved_at.eq."${answeredAt}"))`,
    ]);
    expect(held.has('p1')).toBe(false);
    expect(await listPendingDeletions(USER)).toEqual([]);
    expect(await isDeletedHere('p1')).toBe(true);
  });

  it('deleted answered here with a time pulled from the server: sent as written, microseconds and all, and it matches', async () => {
    const pulled = '2026-06-01T19:30:00.123456+00:00';
    await deletedHereAnswered('resolved_no', pulled);
    const { client, filtersSent, held } = fakeServer({
      rows: [serverCopy(pulled, { status: 'resolved_no' })],
    });
    await expect(pushDeletions(USER, client, always)).resolves.toBe(1);
    expect(filtersSent).toEqual([
      `or=(status.eq.pending,and(status.eq.resolved_no,resolved_at.eq."${pulled}"))`,
    ]);
    expect(held.has('p1')).toBe(false);
  });

  it('deleted answered here, changed elsewhere since (Yes became No, its time kept): not removed, and the change comes back here', async () => {
    const answeredAt = '2026-06-01T19:30:00.000Z';
    await deletedHereAnswered('resolved_yes', answeredAt);
    const changed = serverCopy(answeredAt, { status: 'resolved_no', updated_at: '2026-06-01T20:00:00.000Z' });
    const { client, calls, held } = fakeServer({ rows: [changed] });

    await expect(pushDeletions(USER, client, always)).resolves.toBe(0);
    expect(calls).toEqual(['delete:p1', 'recheck']);
    expect(held.get('p1')?.status).toBe('resolved_no');
    expect((await getPrediction('p1'))?.status).toBe('resolved_no');
    expect(await isDeletedHere('p1')).toBe(false);
  });

  it("deleted as a Can't tell here, answered elsewhere since: not removed, and the answer comes back here", async () => {
    await deletedHereAnswered('skipped', '2026-06-02T19:00:00.000Z');
    const answeredLater = serverCopy('2026-06-04T08:00:00.000Z');
    const { client, held } = fakeServer({ rows: [answeredLater] });

    await expect(pushDeletions(USER, client, always)).resolves.toBe(0);
    expect(held.get('p1')?.status).toBe('resolved_yes');
    expect(await getPrediction('p1')).toMatchObject({
      status: 'resolved_yes',
      resolved_at: '2026-06-04T08:00:00.000Z',
    });
  });

  it("deleted answered here before the answer reached the server: the server's open copy is removed", async () => {
    await deletedHereAnswered('resolved_yes', '2026-06-01T19:30:00.000Z');
    const { client, calls, held } = fakeServer({ rows: [serverCopy(null)] });
    await expect(pushDeletions(USER, client, always)).resolves.toBe(1);
    expect(calls).toEqual(['delete:p1']);
    expect(held.has('p1')).toBe(false);
    expect(await listPendingDeletions(USER)).toEqual([]);
  });

  it('never removes an answer given after the deletion: the row is read, restored here, and the tombstone dropped', async () => {
    await deletedHere();
    const answeredAt = afterTheDeletion();
    const { client, calls, held } = fakeServer({ rows: [serverCopy(answeredAt)] });

    await expect(pushDeletions(USER, client, always)).resolves.toBe(0);
    expect(calls).toEqual(['delete:p1', 'recheck']);
    expect(held.get('p1')?.resolved_at).toBe(answeredAt);
    expect((await getPrediction('p1'))?.resolved_at).toBe(answeredAt);
    expect(await listPendingDeletions(USER)).toEqual([]);
    expect(await isDeletedHere('p1')).toBe(false);
  });

  it('closes the window: an answer that reaches the server after the pull saw the row open is not removed', async () => {
    await deletedHere();
    const { client, held } = fakeServer({ rows: [serverCopy(null)] });
    // The pull sees it open: the deletion stands here.
    await pullRemote(USER, client, cursorStore());
    expect(await isDeletedHere('p1')).toBe(true);
    // Another phone answers it now, before this phone's delete goes.
    const answeredAt = afterTheDeletion();
    held.set('p1', serverCopy(answeredAt));

    await expect(pushDeletions(USER, client, always)).resolves.toBe(0);
    expect(held.get('p1')?.status).toBe('resolved_yes');
    expect((await getPrediction('p1'))?.status).toBe('resolved_yes');
  });

  it('a row the server no longer has: the deletion is done', async () => {
    await deletedHere();
    const { client, calls } = fakeServer();
    await expect(pushDeletions(USER, client, always)).resolves.toBe(1);
    expect(calls).toEqual(['delete:p1', 'recheck']);
    expect(await listPendingDeletions(USER)).toEqual([]);
  });

  it('a read that fails after a delete that removed nothing leaves the tombstone for the next sweep', async () => {
    await deletedHere();
    const { client, held } = fakeServer({ rows: [serverCopy(afterTheDeletion())], failRead: true });
    await expect(pushDeletions(USER, client, always)).resolves.toBe(0);
    expect(held.has('p1')).toBe(true);
    expect(await listPendingDeletions(USER)).toEqual(['p1']);
    expect(await getPrediction('p1')).toBeNull();
  });

  // Round 7. Was 'a row the server kept though the deletion should have gone
  // (an answer with no time) leaves the tombstone waiting': under round 6 an
  // answer whose time couldn't be read was kept on the server but not
  // restored, so the deletion waited for good. An open copy's deletion now
  // never removes an answered row, and an answer it never saw outranks it
  // whatever its time (`tombstoneCovers`, src/db): restored here.
  it('an answer with no time, this phone having deleted its open copy: not removed, and restored here', async () => {
    await deletedHere();
    const { client, calls, held } = fakeServer({
      rows: [serverCopy(null, { status: 'resolved_yes', resolved_at: null })],
    });
    await expect(pushDeletions(USER, client, always)).resolves.toBe(0);
    expect(calls).toEqual(['delete:p1', 'recheck']);
    expect(held.has('p1')).toBe(true);
    expect((await getPrediction('p1'))?.status).toBe('resolved_yes');
    expect(await listPendingDeletions(USER)).toEqual([]);
    expect(await isDeletedHere('p1')).toBe(false);
  });

  // The read-back keeps the tombstone only for a row this deletion covers,
  // which the delete would have removed; one left there anyway (a server
  // that answered nothing to the delete, say) leaves the tombstone waiting
  // for the next sweep, and nothing is restored.
  it('a covered row the delete left anyway leaves the tombstone waiting', async () => {
    await deletedHere();
    // A server whose delete removes nothing and says so, and whose read
    // still finds the row open.
    const deleteQuery = {
      eq: () => deleteQuery,
      or: () => deleteQuery,
      select: async () => ({ data: [], error: null }),
    };
    const readQuery = {
      eq: () => readQuery,
      in: async () => ({ data: [serverCopy(null)], error: null }),
    };
    const client = {
      from: () => ({ delete: () => deleteQuery, select: () => readQuery }),
    } as unknown as SupabaseClient;

    await expect(pushDeletions(USER, client, always)).resolves.toBe(0);
    expect(await getPrediction('p1')).toBeNull();
    expect(await listPendingDeletions(USER)).toEqual(['p1']);
    expect(await isDeletedHere('p1')).toBe(true);
  });

  it('a deletion whose time cannot be read is never sent', async () => {
    await deletedHere();
    await getDb().run(`UPDATE prediction_deletions SET deleted_at = ? WHERE id = ?`, ['soon', 'p1']);
    const { client, calls, held } = fakeServer({ rows: [serverCopy(null)] });
    await expect(pushDeletions(USER, client, always)).resolves.toBe(0);
    expect(calls).toEqual([]);
    expect(held.has('p1')).toBe(true);
    expect(await listPendingDeletions(USER)).toEqual(['p1']);
  });

  it("is scoped to this account: another account's row is neither removed nor brought here", async () => {
    await deletedHere();
    const { client, held } = fakeServer({ rows: [serverCopy(afterTheDeletion(), { user_id: 'user-bbb' })] });
    await expect(pushDeletions(USER, client, always)).resolves.toBe(1);
    expect(held.has('p1')).toBe(true);
    expect(await getPrediction('p1')).toBeNull();
  });

  it('writes nothing here for an account leaving the phone', async () => {
    await deletedHere();
    const { client } = fakeServer({ rows: [serverCopy(afterTheDeletion())] });
    await stopSyncFor(USER);
    await expect(pushDeletions(USER, client, always)).resolves.toBe(0);
    expect(await getPrediction('p1')).toBeNull();
    expect(await listPendingDeletions(USER)).toEqual(['p1']);
  });

  it('in a sweep: the answer stays on the server and comes back here, and the stats are recomputed', async () => {
    await deletedHere();
    const answeredAt = afterTheDeletion();
    const { client, held } = fakeServer({ rows: [serverCopy(answeredAt)] });
    const recompute = jest.fn(async () => {});

    await syncNow(USER, { client, cursorStore: cursorStore(), recompute });
    expect(held.get('p1')?.resolved_at).toBe(answeredAt);
    expect((await getPrediction('p1'))?.status).toBe('resolved_yes');
    expect(recompute).toHaveBeenCalledWith(USER);
  });

  it("in sign-out's one more push, which pulls nothing: the answer stays on the server", async () => {
    await deletedHere();
    const answeredAt = afterTheDeletion();
    const { client, calls, held } = fakeServer({ rows: [serverCopy(answeredAt)] });

    await expect(pushNow(USER, { client })).resolves.toBe(0);
    expect(calls).toEqual(['delete:p1', 'recheck']);
    expect(held.get('p1')?.status).toBe('resolved_yes');
    expect(await countUnsynced(USER)).toBe(0);
  });
});
