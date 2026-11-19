// The server's write limits (Supabase migration 011): at most 100 new or 100
// changed rows per upsert (PT413), and account caps (50,000 predictions, and
// a text budget that refuses only statements adding text) past which a
// statement is refused (PT429). The push sends batches of at most 100; a
// batch refused for a limit is tried once more row by row, the rows refused
// alone stay dirty (sign-out counts them and asks), and the push goes on.

import type { SupabaseClient } from '@supabase/supabase-js';

import { setDbForTests } from '@/db/client';
import { countUnsynced, insertPrediction, listDirtyPredictions } from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import type { Prediction, PredictionWireRow } from '@/types';

import { __resetSyncStateForTests, PUSH_BATCH_SIZE, pushDirty, pushNow } from './sync';

const USER = 'user-aaa';

const prediction = (i: number): Prediction => ({
  id: `p-${String(i).padStart(4, '0')}`,
  user_id: USER,
  title: `A secret title ${i}`,
  category: 'work',
  confidence: 60,
  created_at: '2026-05-01T00:00:00.000Z',
  due_date: '2026-06-01T00:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
});

async function dirtyRows(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) await insertPrediction(prediction(i));
}

/** What the server answers for an upsert of these rows. Null is success. */
type Answer = null | { code: string; message: string };

const capReached = (): Answer => ({
  code: 'PT429',
  message: 'predictions: an account holds at most 50000 predictions',
});
const tooMany = (): Answer => ({ code: 'PT413', message: 'predictions: at most 100 new rows in one request' });

/**
 * A server that refuses, with `refusal`, any statement holding one of the
 * `refused` rows (rows that would add text past the budget, say), and takes
 * everything else; `answers`, when given, answers the first upserts in turn.
 */
function fakeClient(
  opts: { refused?: Set<string>; refusal?: () => Answer; answers?: Answer[] } = {},
) {
  const upserts: PredictionWireRow[][] = [];
  const from = () => ({
    upsert(rows: PredictionWireRow[]) {
      upserts.push(rows);
      const scripted = opts.answers?.[upserts.length - 1];
      if (scripted !== undefined) return Promise.resolve({ error: scripted });
      const refuse = rows.some((r) => opts.refused?.has(r.id));
      return Promise.resolve({ error: refuse ? (opts.refusal ?? capReached)() : null });
    },
  });
  const client = {
    from,
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER } } }, error: null }),
    },
  } as unknown as SupabaseClient;
  return { client, upserts };
}

const idOf = (i: number) => prediction(i).id;

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

describe('item 7: batches of at most 100 rows', () => {
  it('sends 250 dirty rows as 100, 100 and 50, checking the session before each', async () => {
    await dirtyRows(250);
    const { client, upserts } = fakeClient();
    const stillCurrent = jest.fn(async () => true);

    await expect(pushDirty(USER, client, stillCurrent)).resolves.toBe(250);
    expect(PUSH_BATCH_SIZE).toBe(100);
    expect(upserts.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(stillCurrent).toHaveBeenCalledTimes(3);
    // Oldest change first, every row once.
    expect(new Set(upserts.flat().map((r) => r.id)).size).toBe(250);
    expect(await listDirtyPredictions(USER)).toEqual([]);
  });

  it('a session that changes between batches stops the push; the rest stays dirty', async () => {
    await dirtyRows(250);
    const { client, upserts } = fakeClient();
    const stillCurrent = jest.fn().mockResolvedValueOnce(true).mockResolvedValue(false);

    await expect(pushDirty(USER, client, stillCurrent)).resolves.toBe(100);
    expect(upserts).toHaveLength(1);
    expect(await countUnsynced(USER)).toBe(150);
  });

  it('100 rows go as one request', async () => {
    await dirtyRows(100);
    const { client, upserts } = fakeClient();
    await expect(pushDirty(USER, client, async () => true)).resolves.toBe(100);
    expect(upserts).toHaveLength(1);
  });

  it('a batch refused as too large is tried row by row, and every row goes', async () => {
    await dirtyRows(3);
    const { client, upserts } = fakeClient({ answers: [tooMany()] });
    await expect(pushDirty(USER, client, async () => true)).resolves.toBe(3);
    expect(upserts.map((b) => b.length)).toEqual([3, 1, 1, 1]);
  });
});

describe('item 8: a statement refused for a limit (PT429)', () => {
  it('tries the refused batch once row by row, keeps the refused rows dirty and goes on to the next batch', async () => {
    await dirtyRows(150);
    // Ten rows that would add text past the budget, all in the first batch.
    const refused = new Set([5, 17, 23, 40, 41, 42, 60, 77, 88, 99].map(idOf));
    const { client, upserts } = fakeClient({ refused });

    await expect(pushDirty(USER, client, async () => true)).resolves.toBe(140);
    // The batch of 100, its 100 rows alone, then the batch of 50.
    expect(upserts.map((b) => b.length)).toEqual([100, ...Array(100).fill(1), 50]);
    // Each row of the refused batch was tried alone exactly once.
    const alone = upserts.filter((b) => b.length === 1).map((b) => b[0].id);
    expect(new Set(alone).size).toBe(100);
    // The refused rows stay on the phone, counted for sign-out.
    expect(await countUnsynced(USER)).toBe(10);
    expect((await listDirtyPredictions(USER)).map((r) => r.id).sort()).toEqual([...refused].sort());
  });

  it('an answer or a move in the same batch as a refused row still goes through', async () => {
    await dirtyRows(2);
    const { client } = fakeClient({ refused: new Set([idOf(0)]) });
    await expect(pushDirty(USER, client, async () => true)).resolves.toBe(1);
    expect((await listDirtyPredictions(USER)).map((r) => r.id)).toEqual([idOf(0)]);
  });

  it('a later batch is tried too, after a refused one', async () => {
    await dirtyRows(250);
    const refused = new Set([idOf(150)]);
    const { client, upserts } = fakeClient({ refused });
    await expect(pushDirty(USER, client, async () => true)).resolves.toBe(249);
    expect(upserts.filter((b) => b.length > 1).map((b) => b.length)).toEqual([100, 100, 50]);
    expect(await countUnsynced(USER)).toBe(1);
  });

  it('handles PT413 the same way, should it ever come', async () => {
    await dirtyRows(4);
    const { client } = fakeClient({ refused: new Set([idOf(2)]), refusal: tooMany });
    await expect(pushDirty(USER, client, async () => true)).resolves.toBe(3);
    expect(await countUnsynced(USER)).toBe(1);
  });

  it('a session that changes during the row-by-row pass stops it; the rest stays dirty', async () => {
    await dirtyRows(5);
    const { client } = fakeClient({ refused: new Set([idOf(0)]) });
    const stillCurrent = jest
      .fn()
      .mockResolvedValueOnce(true) // the batch
      .mockResolvedValueOnce(true) // row 0, refused
      .mockResolvedValueOnce(true) // row 1, goes
      .mockResolvedValue(false);
    await expect(pushDirty(USER, client, stillCurrent)).resolves.toBe(1);
    expect(await countUnsynced(USER)).toBe(4);
  });

  it('logs only the code and a count: no title, no id, not the server message', async () => {
    await dirtyRows(3);
    const { client } = fakeClient({ refused: new Set([idOf(0), idOf(1)]) });
    await pushDirty(USER, client, async () => true);
    const logged = JSON.stringify((console.warn as jest.Mock).mock.calls);
    expect(logged).toContain('PT429');
    expect(logged).toContain('2 row(s) refused');
    expect(logged).not.toContain('secret title');
    expect(logged).not.toContain('p-0000');
    expect(logged).not.toContain('50000');
  });

  it("sign-out's one more push leaves the refused rows counted, so the person is asked before they go", async () => {
    await dirtyRows(3);
    const { client } = fakeClient({ refused: new Set([idOf(0), idOf(2)]) });
    await expect(pushNow(USER, { client })).resolves.toBe(1);
    expect(await countUnsynced(USER)).toBe(2);
  });
});
