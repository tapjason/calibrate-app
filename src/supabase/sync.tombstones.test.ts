// Round 6, item 6: a stale phone's deletion must not remove an answer given
// elsewhere. Phone A deletes its open copy of a prediction; phone B, which
// hadn't heard of the delete, answers it afterwards. Before, A's deletion
// went to the server first in every sweep (and in sign-out's push, which
// pulls nothing) and took B's answer off it for every phone; and A's pull
// skipped the answered row for good.
//
// Now the pull hands such a row to `reconcileTombstoneWithRemote` (src/db),
// and the server delete is conditional: it removes the row only while it is
// open or answered no later than A's deletion, in the same statement, so no
// answer can land between a check and the delete. When it removes nothing,
// the row is read and reconciled: answered after the deletion, it is
// restored here and the tombstone dropped. Real SQLite (the test database);
// a fake server that applies the delete's filter as PostgREST would.

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
} from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import type { Prediction, PredictionWireRow } from '@/types';

import {
  __resetSyncStateForTests,
  openOrAnsweredBy,
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

/** The delete's `or` filter, applied as PostgREST would. Throws on any other shape. */
function passesFilter(row: PredictionWireRow, filter: string): boolean {
  const match = /^status\.eq\.pending,resolved_at\.lte\."([^"]+)"$/.exec(filter);
  if (!match) throw new Error(`unexpected filter: ${filter}`);
  if (row.status === 'pending') return true;
  return row.resolved_at !== null && Date.parse(row.resolved_at) <= Date.parse(match[1]);
}

/**
 * A server holding `rows`, recording every request in order: `delete:<id>`
 * for each delete sent, `recheck` for a read of rows by id, `pull` for the
 * pull. `failRead` makes a read by id fail.
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
      let allowed = '';
      const q = {
        eq(col: string, val: unknown) {
          filters[col] = val;
          return q;
        },
        or(filter: string) {
          allowed = filter;
          return q;
        },
        select() {
          const id = String(filters.id);
          calls.push(`delete:${id}`);
          filtersSent.push(allowed);
          const row = held.get(id);
          if (row && row.user_id === filters.user_id && passesFilter(row, allowed)) {
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

const always = async () => true;

describe('openOrAnsweredBy', () => {
  it('limits the delete to an open row, or one answered no later than the deletion, the time double-quoted', () => {
    expect(openOrAnsweredBy('2026-11-19T10:00:00.000Z')).toBe(
      'status.eq.pending,resolved_at.lte."2026-11-19T10:00:00.000Z"',
    );
    expect(openOrAnsweredBy('2026-11-19T10:00:00+05:30')).toBe(
      'status.eq.pending,resolved_at.lte."2026-11-19T10:00:00+05:30"',
    );
  });

  it('gives nothing for a time it cannot read, or one that would break out of the quotes', () => {
    for (const bad of ['', 'soon', '2026-13-45T10:00:00.000Z', '2026-11-19T10:00:00.000Z"),id.neq.("', '2026-11-19 10:00:00']) {
      expect(openOrAnsweredBy(bad)).toBeNull();
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

  it('answered before the deletion: the deletion stands', async () => {
    await deletedHere();
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
  it("sends this phone's deletion time, double-quoted, and removes an open row", async () => {
    await deletedHere();
    const [{ deleted_at: deletedAt }] = await listDeletions(USER);
    const { client, calls, filtersSent, held } = fakeServer({ rows: [serverCopy(null)] });

    await expect(pushDeletions(USER, client, always)).resolves.toBe(1);
    expect(calls).toEqual(['delete:p1']);
    expect(filtersSent).toEqual([`status.eq.pending,resolved_at.lte."${deletedAt}"`]);
    expect(held.has('p1')).toBe(false);
    expect(await listPendingDeletions(USER)).toEqual([]);
    // The tombstone stays, pushed (D45).
    expect(await isDeletedHere('p1')).toBe(true);
  });

  it('removes a row answered before the deletion, as it always did', async () => {
    await deletedHere();
    const { client, held } = fakeServer({ rows: [serverCopy(longBefore)] });
    await expect(pushDeletions(USER, client, always)).resolves.toBe(1);
    expect(held.size).toBe(0);
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

  it('a row the server kept though the deletion should have gone (an answer with no time) leaves the tombstone waiting', async () => {
    await deletedHere();
    const { client, held } = fakeServer({
      rows: [serverCopy(null, { status: 'resolved_yes', resolved_at: null })],
    });
    await expect(pushDeletions(USER, client, always)).resolves.toBe(0);
    expect(held.has('p1')).toBe(true);
    expect(await listPendingDeletions(USER)).toEqual(['p1']);
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
