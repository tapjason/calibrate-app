// The UTC offsets stored with a prediction (owner decision 2026-11-19, SQLite
// migration 018): the logging's and the rewording's, written with the moment
// they belong to and synced only once UTC_OFFSET_SYNC is on (it waits for the
// Supabase migration that adds the columns). Both flag states are tested
// here through a getter, since the helpers read the flag on each call.
//
// Review round 6: the answer's offset (`resolved_utc_offset_min`, also added
// by 018) is no longer written, read or synced; the same-day rule reads the
// answer's day in the logging offset. The column stays, and these tests read
// it raw to show nothing writes it.
//
// Also the one-time offset backfill (`listOffsetBackfill`, the `sync_markers`
// marker), which replaced a whole-row re-push of rows pushed before the flag.

import type { Prediction, PredictionWireRow } from '@/types';

import { wipeLocalUserData } from './account';
import { getDb, setDbForTests } from './client';
import { LOCAL_GUEST_USER_ID } from './migrateGuestData';
import {
  answerSkippedPrediction,
  correctPredictionOutcome,
  countUnsynced,
  deletePrediction,
  getPrediction,
  insertPrediction,
  listDirtyPredictions,
  listDirtyPredictionsSettled,
  listOffsetBackfill,
  markOffsetBackfillDone,
  markPredictionSynced,
  OFFSET_BACKFILL_MARKER,
  offsetBackfillDone,
  resolvePrediction,
  updatePrediction,
  upsertPredictionFromRemote,
} from './predictions';
import { createTestDb } from './testing';

let mockOffsetSync = false;
// A getter defined on the object, not in a spread literal: Babel compiles a
// spread literal to Object.assign, which reads a getter once, at mock time.
jest.mock('@/constants/app', () =>
  Object.defineProperty({ ...jest.requireActual('@/constants/app') }, 'UTC_OFFSET_SYNC', {
    enumerable: true,
    get: () => mockOffsetSync,
  }),
);

const NEW_YORK = -300;
const LONDON = 0;

const prediction = (over: Partial<Prediction> = {}): Prediction => ({
  id: 'p1',
  user_id: 'u1',
  title: 'Ship the prototype',
  category: 'work',
  confidence: 70,
  created_at: '2026-11-18T14:00:00.000Z',
  due_date: '2026-11-20T17:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
  ...over,
});

const wire = (over: Partial<PredictionWireRow> = {}): PredictionWireRow => ({
  id: 'p1',
  user_id: 'u1',
  title: 'Ship the prototype',
  category: 'work',
  confidence: 70,
  created_at: '2026-11-18T14:00:00.000Z',
  due_date: '2026-11-20T17:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
  title_edited_at: null,
  updated_at: '2099-01-01T00:00:00.000Z',
  ...over,
});

/**
 * A pulled row from a server that still has the round-5 answer-offset column
 * (migration 011 as first drafted): the key isn't in the wire type any more.
 */
const withStaleAnswerOffset = (row: PredictionWireRow, offset: number): PredictionWireRow =>
  ({ ...row, resolved_utc_offset_min: offset }) as PredictionWireRow;

async function offsetsOf(id: string) {
  return await getDb().get<{
    created_utc_offset_min: number | null;
    resolved_utc_offset_min: number | null;
    title_edited_utc_offset_min: number | null;
  }>(
    `SELECT created_utc_offset_min, resolved_utc_offset_min, title_edited_utc_offset_min
       FROM predictions WHERE id = ?`,
    [id],
  );
}

/** The sync columns of a row, as stored. */
async function rawSync(id: string) {
  return await getDb().get<{ dirty: number; updated_at: string }>(
    `SELECT dirty, updated_at FROM predictions WHERE id = ?`,
    [id],
  );
}

/** Mark every dirty row of `userId`'s pushed, as a successful push does. */
async function pushedAll(userId = 'u1'): Promise<void> {
  for (const row of await listDirtyPredictions(userId)) {
    await markPredictionSynced(row.id, row.updated_at);
  }
}

/** The `sync_markers` rows stored for `userId`, or for everyone. */
async function markerRows(userId?: string) {
  return await getDb().all<{ user_id: string; marker: string; done_at: string }>(
    userId === undefined
      ? `SELECT user_id, marker, done_at FROM sync_markers ORDER BY user_id`
      : `SELECT user_id, marker, done_at FROM sync_markers WHERE user_id = ?`,
    userId === undefined ? [] : [userId],
  );
}

/** Every row in `predictions`, as stored, by id. */
async function allRaw() {
  return await getDb().all<Record<string, unknown>>(`SELECT * FROM predictions ORDER BY id`);
}

beforeEach(async () => {
  mockOffsetSync = false;
  setDbForTests(await createTestDb());
});

afterEach(() => {
  setDbForTests(null);
});

describe('writing the offsets', () => {
  it('stores the logging offset a new prediction carries, and reads none when there is none', async () => {
    await insertPrediction(prediction({ id: 'with', created_utc_offset_min: NEW_YORK }));
    await insertPrediction(prediction({ id: 'without' }));
    expect(await getPrediction('with')).toMatchObject({ created_utc_offset_min: NEW_YORK });
    // A row without offsets reads exactly as rows did before migration 018.
    const without = await getPrediction('without');
    expect(without).not.toHaveProperty('created_utc_offset_min');
    expect(without).not.toHaveProperty('resolved_utc_offset_min');
    expect(without).not.toHaveProperty('title_edited_utc_offset_min');
  });

  it('stores an unusable offset as none, never failing the save', async () => {
    await insertPrediction(prediction({ id: 'bad', created_utc_offset_min: 9999 }));
    await insertPrediction(prediction({ id: 'half', created_utc_offset_min: 1.5 }));
    expect((await offsetsOf('bad'))?.created_utc_offset_min).toBeNull();
    expect((await offsetsOf('half'))?.created_utc_offset_min).toBeNull();
  });

  // Round 6: the answer has its time, never an offset.
  it('stores the answer with the time it was given at, and no offset', async () => {
    await insertPrediction(prediction({ created_utc_offset_min: NEW_YORK }));
    await resolvePrediction('p1', 'resolved_no', undefined, { at: '2026-11-19T03:00:00.000Z' });
    const answered = await getPrediction('p1');
    expect(answered).toMatchObject({
      status: 'resolved_no',
      resolved_at: '2026-11-19T03:00:00.000Z',
      created_utc_offset_min: NEW_YORK,
    });
    expect(answered).not.toHaveProperty('resolved_utc_offset_min');
    expect((await offsetsOf('p1'))?.resolved_utc_offset_min).toBeNull();
  });

  it('writes no answer offset when the caller states no time either', async () => {
    await insertPrediction(prediction());
    await resolvePrediction('p1', 'resolved_yes');
    expect((await offsetsOf('p1'))?.resolved_utc_offset_min).toBeNull();
  });

  it("keeps the first answer's time through a correction (D34)", async () => {
    await insertPrediction(prediction());
    await resolvePrediction('p1', 'resolved_yes', undefined, { at: '2026-11-19T03:00:00.000Z' });
    await correctPredictionOutcome('p1', 'resolved_no');
    expect(await getPrediction('p1')).toMatchObject({
      status: 'resolved_no',
      resolved_at: '2026-11-19T03:00:00.000Z',
    });
    expect((await offsetsOf('p1'))?.resolved_utc_offset_min).toBeNull();
  });

  it("gives a Can't tell answered later the new answer's time, and no offset", async () => {
    await insertPrediction(prediction());
    await resolvePrediction('p1', 'skipped', undefined, { at: '2026-11-19T03:00:00.000Z' });
    await answerSkippedPrediction('p1', 'resolved_yes', undefined, {
      at: '2026-11-21T09:00:00.000Z',
    });
    expect(await getPrediction('p1')).toMatchObject({
      status: 'resolved_yes',
      resolved_at: '2026-11-21T09:00:00.000Z',
    });
    expect((await offsetsOf('p1'))?.resolved_utc_offset_min).toBeNull();
  });

  it('dates new words with their offset, and leaves both alone on an edit without new words', async () => {
    await insertPrediction(prediction({ created_utc_offset_min: NEW_YORK }));
    const edit = { title: 'No prototype', category: 'work' as const, due_date: '2026-11-21T17:00:00.000Z' };
    await updatePrediction('p1', edit, {
      rewordedAt: '2026-11-19T09:00:00.000Z',
      rewordedUtcOffsetMin: LONDON,
    });
    expect(await getPrediction('p1')).toMatchObject({
      title_edited_at: '2026-11-19T09:00:00.000Z',
      title_edited_utc_offset_min: LONDON,
      created_utc_offset_min: NEW_YORK,
    });
    await updatePrediction('p1', { ...edit, category: 'health' });
    expect(await getPrediction('p1')).toMatchObject({
      category: 'health',
      title_edited_at: '2026-11-19T09:00:00.000Z',
      title_edited_utc_offset_min: LONDON,
    });
  });

  // A value written by a round-5 build stays in the column, unread.
  it("never reads an answer offset a round-5 build left in the column", async () => {
    await insertPrediction(prediction());
    await resolvePrediction('p1', 'resolved_yes', undefined, { at: '2026-11-19T03:00:00.000Z' });
    await getDb().run(`UPDATE predictions SET resolved_utc_offset_min = 840 WHERE id = 'p1'`);
    expect(await getPrediction('p1')).not.toHaveProperty('resolved_utc_offset_min');
    mockOffsetSync = true;
    const [up] = await listDirtyPredictions('u1');
    expect(up).not.toHaveProperty('resolved_utc_offset_min');
  });
});

describe('with UTC_OFFSET_SYNC off (the live table has no columns yet)', () => {
  it('names no offset on any pushed row', async () => {
    await insertPrediction(prediction({ id: 'a', created_utc_offset_min: NEW_YORK }));
    await insertPrediction(prediction({ id: 'b' }));
    const batch = await listDirtyPredictions('u1');
    expect(batch).toHaveLength(2);
    for (const row of batch) {
      expect(row).not.toHaveProperty('created_utc_offset_min');
      expect(row).not.toHaveProperty('resolved_utc_offset_min');
      expect(row).not.toHaveProperty('title_edited_utc_offset_min');
    }
  });

  it("keeps this phone's offset for a moment the pulled row shares, however the server wrote it", async () => {
    await insertPrediction(prediction({ created_utc_offset_min: NEW_YORK }));
    await resolvePrediction('p1', 'resolved_yes', undefined, { at: '2026-11-19T03:00:00.000Z' });
    // The server's copy: the same moments, written as Postgres writes them,
    // with offsets that must be ignored.
    await upsertPredictionFromRemote(
      withStaleAnswerOffset(
        wire({
          title: 'Renamed elsewhere',
          status: 'resolved_yes',
          created_at: '2026-11-18T14:00:00+00:00',
          resolved_at: '2026-11-19T03:00:00+00:00',
          created_utc_offset_min: 600,
        }),
        600,
      ),
    );
    expect(await offsetsOf('p1')).toEqual({
      created_utc_offset_min: NEW_YORK,
      resolved_utc_offset_min: null,
      title_edited_utc_offset_min: null,
    });
    expect((await getPrediction('p1'))?.title).toBe('Renamed elsewhere');
  });

  it('keeps no offset for a moment the pulled row changed, so it is read in the phone’s zone', async () => {
    await insertPrediction(
      prediction({ status: 'skipped', resolved_at: '2026-11-20T20:00:00.000Z', created_utc_offset_min: NEW_YORK }),
    );
    // Logged again elsewhere (another created_at) and reworded there.
    await upsertPredictionFromRemote(
      withStaleAnswerOffset(
        wire({
          created_at: '2026-11-18T15:00:00.000Z',
          status: 'resolved_yes',
          resolved_at: '2026-11-22T10:00:00.000Z',
          title_edited_at: '2026-11-19T10:00:00.000Z',
          title_edited_utc_offset_min: LONDON,
        }),
        LONDON,
      ),
    );
    expect(await offsetsOf('p1')).toEqual({
      created_utc_offset_min: null,
      resolved_utc_offset_min: null,
      title_edited_utc_offset_min: null,
    });
  });

  it('inserts a pulled row it never had with no offsets', async () => {
    await upsertPredictionFromRemote(wire({ id: 'new', created_utc_offset_min: NEW_YORK }));
    expect(await offsetsOf('new')).toEqual({
      created_utc_offset_min: null,
      resolved_utc_offset_min: null,
      title_edited_utc_offset_min: null,
    });
  });
});

describe('with UTC_OFFSET_SYNC on', () => {
  beforeEach(() => {
    mockOffsetSync = true;
  });

  // The union-of-keys rule (security review 2026-11-18): postgrest-js names
  // every key any row in a batch has, and a row without one is written NULL.
  it("puts both on every pushed row, null included, and never the answer's", async () => {
    await insertPrediction(prediction({ id: 'a', created_utc_offset_min: NEW_YORK }));
    await insertPrediction(prediction({ id: 'b' }));
    await resolvePrediction('b', 'resolved_yes', undefined, { at: '2026-11-19T03:00:00.000Z' });
    await insertPrediction(prediction({ id: 'c' }));
    await updatePrediction(
      'c',
      { title: 'New words', category: 'work', due_date: '2026-11-21T17:00:00.000Z' },
      { rewordedAt: '2026-11-19T09:00:00.000Z', rewordedUtcOffsetMin: LONDON },
    );
    const rows = await listDirtyPredictions('u1');
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.a).toMatchObject({ created_utc_offset_min: NEW_YORK, title_edited_utc_offset_min: null });
    expect(byId.b).toMatchObject({ created_utc_offset_min: null, title_edited_utc_offset_min: null });
    expect(byId.c).toMatchObject({ created_utc_offset_min: null, title_edited_utc_offset_min: LONDON });
    for (const row of rows) {
      expect(row).toHaveProperty('created_utc_offset_min');
      expect(row).toHaveProperty('title_edited_utc_offset_min');
      expect(row).not.toHaveProperty('resolved_utc_offset_min');
    }
    const union = new Set(rows.flatMap((r) => Object.keys(r)));
    for (const row of rows) expect(new Set(Object.keys(row))).toEqual(union);
  });

  it("takes the winning row's offsets when it has them, and never writes the answer's", async () => {
    await insertPrediction(prediction({ created_utc_offset_min: NEW_YORK }));
    await upsertPredictionFromRemote(
      withStaleAnswerOffset(
        wire({
          status: 'resolved_no',
          resolved_at: '2026-11-19T10:00:00.000Z',
          created_utc_offset_min: 600,
          title_edited_at: '2026-11-19T09:00:00.000Z',
          title_edited_utc_offset_min: LONDON,
        }),
        LONDON,
      ),
    );
    expect(await offsetsOf('p1')).toEqual({
      created_utc_offset_min: 600,
      resolved_utc_offset_min: null,
      title_edited_utc_offset_min: LONDON,
    });
    // A pulled row with no keys at all (an older build's) that this phone
    // never had reads as none.
    await upsertPredictionFromRemote(
      wire({ id: 'old', status: 'pending', updated_at: '2099-01-02T00:00:00.000Z' }),
    );
    expect((await offsetsOf('old'))?.created_utc_offset_min).toBeNull();
  });

  // Review round 6: a row pushed by an older build, or by this phone before
  // the flag, comes back with null offsets. Taking them erased what this
  // phone knew, and a same-day answer fell back to the phone's zone.
  it("keeps this phone's offset when the winning row has none for the same moment", async () => {
    await insertPrediction(
      prediction({
        created_utc_offset_min: NEW_YORK,
        title_edited_at: '2026-11-19T09:00:00.000Z',
        title_edited_utc_offset_min: LONDON,
      }),
    );
    // Answered on another phone; the same moments written as Postgres
    // writes them, with null offsets.
    await upsertPredictionFromRemote(
      wire({
        status: 'resolved_yes',
        resolved_at: '2026-11-20T18:00:00+00:00',
        created_at: '2026-11-18T14:00:00+00:00',
        title_edited_at: '2026-11-19T09:00:00+00:00',
        created_utc_offset_min: null,
        title_edited_utc_offset_min: null,
      }),
    );
    expect(await offsetsOf('p1')).toEqual({
      created_utc_offset_min: NEW_YORK,
      resolved_utc_offset_min: null,
      title_edited_utc_offset_min: LONDON,
    });
    expect(await getPrediction('p1')).toMatchObject({
      status: 'resolved_yes',
      created_utc_offset_min: NEW_YORK,
      title_edited_utc_offset_min: LONDON,
    });
    // An older build's row names no offset at all: the same.
    await upsertPredictionFromRemote(
      wire({
        status: 'resolved_no',
        resolved_at: '2026-11-20T18:00:00.000Z',
        title_edited_at: '2026-11-19T09:00:00.000Z',
        updated_at: '2099-01-02T00:00:00.000Z',
      }),
    );
    expect(await offsetsOf('p1')).toMatchObject({
      created_utc_offset_min: NEW_YORK,
      title_edited_utc_offset_min: LONDON,
    });
  });

  it('keeps none for a moment the winning row changed and brings no offset for', async () => {
    await insertPrediction(
      prediction({
        created_utc_offset_min: NEW_YORK,
        title_edited_at: '2026-11-19T09:00:00.000Z',
        title_edited_utc_offset_min: LONDON,
      }),
    );
    // Reworded again on an older build: new words, a new date, no offset.
    await upsertPredictionFromRemote(
      wire({
        title: 'Ship half the prototype',
        title_edited_at: '2026-11-19T15:00:00.000Z',
        title_edited_utc_offset_min: null,
        created_utc_offset_min: null,
      }),
    );
    expect(await offsetsOf('p1')).toEqual({
      created_utc_offset_min: NEW_YORK,
      resolved_utc_offset_min: null,
      title_edited_utc_offset_min: null,
    });
    // A rewording the pulled row doesn't have (no date): no offset left for it.
    await insertPrediction(
      prediction({
        id: 'q',
        title_edited_at: '2026-11-19T09:00:00.000Z',
        title_edited_utc_offset_min: LONDON,
      }),
    );
    await upsertPredictionFromRemote(wire({ id: 'q', title_edited_at: null }));
    expect((await offsetsOf('q'))?.title_edited_utc_offset_min).toBeNull();
  });

  it("falls back to this phone's offset when the pulled one is unusable", async () => {
    await insertPrediction(prediction({ created_utc_offset_min: NEW_YORK }));
    await upsertPredictionFromRemote(wire({ created_utc_offset_min: 5000 }));
    expect((await offsetsOf('p1'))?.created_utc_offset_min).toBe(NEW_YORK);
  });

  // The flip itself: a row this phone pushed while the flag was off holds its
  // offset only here. Another phone on an older build answers it; with the
  // flag on, that answer comes down with no offsets. This phone keeps its own
  // (gap 1), the row stays in step (nothing to push back over the answer),
  // and the backfill lists the offset alone for the server.
  it('survives a stale null-offset pull after the flag flips, and leaves the offset to the backfill', async () => {
    mockOffsetSync = false;
    await insertPrediction(prediction({ created_utc_offset_min: NEW_YORK }));
    const [pushedBefore] = await listDirtyPredictionsSettled('u1');
    expect(pushedBefore).not.toHaveProperty('created_utc_offset_min');
    await markPredictionSynced('p1', pushedBefore.updated_at);

    mockOffsetSync = true;
    await upsertPredictionFromRemote(
      wire({
        status: 'resolved_no',
        resolved_at: '2026-11-20T18:00:00+00:00',
        created_at: '2026-11-18T14:00:00+00:00',
        created_utc_offset_min: null,
        title_edited_utc_offset_min: null,
        updated_at: '2026-11-20T18:00:01.000Z',
      }),
    );
    expect(await getPrediction('p1')).toMatchObject({
      status: 'resolved_no',
      created_utc_offset_min: NEW_YORK,
    });
    expect(await rawSync('p1')).toEqual({ dirty: 0, updated_at: '2026-11-20T18:00:01.000Z' });

    // The push sends nothing: the whole row never goes back up over itself.
    expect(await listDirtyPredictionsSettled('u1')).toEqual([]);
    expect(await countUnsynced('u1')).toBe(0);
    // The moment as the server wrote it, with the offset this phone kept.
    expect(await listOffsetBackfill('u1')).toEqual([
      {
        id: 'p1',
        created_at: '2026-11-18T14:00:00+00:00',
        created_utc_offset_min: NEW_YORK,
        title_edited_at: null,
        title_edited_utc_offset_min: null,
      },
    ]);
  });

  // Main session 2026-11-19: an answered row stands whole against a stale
  // open copy, its offsets included, whatever the copy carries.
  it("keeps an answered row's own offsets against a stale open copy", async () => {
    await insertPrediction(prediction({ created_utc_offset_min: NEW_YORK }));
    await resolvePrediction('p1', 'resolved_yes', undefined, { at: '2026-11-19T03:00:00.000Z' });
    await upsertPredictionFromRemote(
      wire({
        status: 'pending',
        resolved_at: null,
        title_edited_at: '2026-11-20T09:00:00.000Z',
        created_utc_offset_min: LONDON,
        title_edited_utc_offset_min: LONDON,
      }),
    );
    expect(await offsetsOf('p1')).toEqual({
      created_utc_offset_min: NEW_YORK,
      resolved_utc_offset_min: null,
      title_edited_utc_offset_min: null,
    });
    expect(await getPrediction('p1')).not.toHaveProperty('title_edited_at');
  });

  it('stores an unusable pulled offset as none', async () => {
    await upsertPredictionFromRemote(wire({ id: 'bad', created_utc_offset_min: 5000 }));
    expect((await offsetsOf('bad'))?.created_utc_offset_min).toBeNull();
  });
});

// Review round 6: rows pushed while the flag was off went up without their
// offsets. A one-time re-mark of every such row (whole-row re-push) was
// replaced by a narrow backfill: sync sends only the offsets with their
// moments (`listOffsetBackfill`), once per account (`sync_markers`). The
// re-push re-inserted predictions deleted on another phone and let an older
// copy here with a new stamp overwrite a newer answer on the server.

/**
 * Rows this phone pushed while the flag was off, all in step with the
 * server: a, logged with an offset; b, reworded with one only; c, with none;
 * d, logged and reworded with offsets, then answered with a note; and
 * another account's row with an offset.
 */
async function pushedBeforeTheFlag(): Promise<void> {
  await insertPrediction(prediction({ id: 'a', created_utc_offset_min: NEW_YORK }));
  await insertPrediction(prediction({ id: 'b', created_at: '2026-11-18T15:00:00.000Z' }));
  await updatePrediction(
    'b',
    { title: 'New words', category: 'work', due_date: '2026-11-21T17:00:00.000Z' },
    { rewordedAt: '2026-11-19T09:00:00.000Z', rewordedUtcOffsetMin: LONDON },
  );
  await insertPrediction(prediction({ id: 'c', created_at: '2026-11-18T13:00:00.000Z' }));
  await insertPrediction(
    prediction({ id: 'd', created_at: '2026-11-17T10:00:00.000Z', created_utc_offset_min: NEW_YORK }),
  );
  await updatePrediction(
    'd',
    { title: 'Other words', category: 'work', due_date: '2026-11-21T17:00:00.000Z' },
    { rewordedAt: '2026-11-18T08:00:00.000Z', rewordedUtcOffsetMin: LONDON },
  );
  await resolvePrediction('d', 'resolved_no', 'Close call', { at: '2026-11-19T03:00:00.000Z' });
  await insertPrediction(prediction({ id: 'theirs', user_id: 'u2', created_utc_offset_min: 540 }));
  await pushedAll('u1');
  await pushedAll('u2');
}

describe('the push read marks nothing', () => {
  it.each([false, true])(
    'returns only the rows already waiting and changes no row (flag on: %s)',
    async (flag) => {
      await pushedBeforeTheFlag();
      mockOffsetSync = flag;
      const before = await allRaw();

      expect(await listDirtyPredictionsSettled('u1')).toEqual([]);
      expect(await listDirtyPredictionsSettled('u2')).toEqual([]);
      expect(await allRaw()).toEqual(before);
      expect(await countUnsynced('u1')).toBe(0);
      expect(await markerRows()).toEqual([]);

      // A row written since is the only one that goes up, with its own stamp.
      await insertPrediction(prediction({ id: 'new', created_utc_offset_min: NEW_YORK }));
      const stamped = (await rawSync('new'))!.updated_at;
      const batch = await listDirtyPredictionsSettled('u1');
      expect(batch.map((r) => [r.id, r.updated_at])).toEqual([['new', stamped]]);
      expect(await markerRows()).toEqual([]);
    },
  );
});

describe('listOffsetBackfill', () => {
  it("lists this account's rows holding a usable offset, both moments, oldest first", async () => {
    await pushedBeforeTheFlag();
    // Waiting to go up: listed all the same.
    await insertPrediction(
      prediction({ id: 'w', created_at: '2026-11-19T08:00:00.000Z', created_utc_offset_min: LONDON }),
    );
    // Logged at 13:30 UTC, written with another offset: before a (14:00 UTC)
    // by the instant, though after it by the text.
    await upsertPredictionFromRemote(
      wire({ id: 'east', created_at: '2026-11-18T14:30:00+01:00', updated_at: '2026-11-18T14:30:00.000Z' }),
    );
    await getDb().run(`UPDATE predictions SET created_utc_offset_min = 60 WHERE id = 'east'`);
    // Unusable offsets, as an older build or a damaged row might hold them.
    await insertPrediction(prediction({ id: 'bad' }));
    await getDb().run(`UPDATE predictions SET created_utc_offset_min = 9999 WHERE id = 'bad'`);
    await insertPrediction(prediction({ id: 'half' }));
    await getDb().run(`UPDATE predictions SET created_utc_offset_min = 1.5 WHERE id = 'half'`);
    // A rewording offset with no rewording date belongs to no moment.
    await insertPrediction(prediction({ id: 'stray' }));
    await getDb().run(`UPDATE predictions SET title_edited_utc_offset_min = 60 WHERE id = 'stray'`);
    await insertPrediction(
      prediction({ id: 'stray2', created_at: '2026-11-19T09:00:00.000Z', created_utc_offset_min: NEW_YORK }),
    );
    await getDb().run(`UPDATE predictions SET title_edited_utc_offset_min = 60 WHERE id = 'stray2'`);

    const before = await allRaw();
    const unsyncedBefore = await countUnsynced('u1');
    const list = await listOffsetBackfill('u1');

    expect(list).toEqual([
      {
        id: 'd',
        created_at: '2026-11-17T10:00:00.000Z',
        created_utc_offset_min: NEW_YORK,
        title_edited_at: '2026-11-18T08:00:00.000Z',
        title_edited_utc_offset_min: LONDON,
      },
      {
        id: 'east',
        created_at: '2026-11-18T14:30:00+01:00',
        created_utc_offset_min: 60,
        title_edited_at: null,
        title_edited_utc_offset_min: null,
      },
      {
        id: 'a',
        created_at: '2026-11-18T14:00:00.000Z',
        created_utc_offset_min: NEW_YORK,
        title_edited_at: null,
        title_edited_utc_offset_min: null,
      },
      {
        id: 'b',
        created_at: '2026-11-18T15:00:00.000Z',
        created_utc_offset_min: null,
        title_edited_at: '2026-11-19T09:00:00.000Z',
        title_edited_utc_offset_min: LONDON,
      },
      {
        id: 'w',
        created_at: '2026-11-19T08:00:00.000Z',
        created_utc_offset_min: LONDON,
        title_edited_at: null,
        title_edited_utc_offset_min: null,
      },
      {
        id: 'stray2',
        created_at: '2026-11-19T09:00:00.000Z',
        created_utc_offset_min: NEW_YORK,
        title_edited_at: null,
        title_edited_utc_offset_min: null,
      },
    ]);
    // The offsets and their moments only: no words, no answer, no stamp.
    for (const row of list) {
      expect(Object.keys(row).sort()).toEqual([
        'created_at',
        'created_utc_offset_min',
        'id',
        'title_edited_at',
        'title_edited_utc_offset_min',
      ]);
    }
    // Read-only: no column moved, dirty and updated_at included.
    expect(await allRaw()).toEqual(before);
    expect(await countUnsynced('u1')).toBe(unsyncedBefore);
    expect(await markerRows()).toEqual([]);
  });

  it('reads the same with the flag off: the caller decides when to send', async () => {
    await pushedBeforeTheFlag();
    mockOffsetSync = false;
    const off = await listOffsetBackfill('u1');
    mockOffsetSync = true;
    expect(await listOffsetBackfill('u1')).toEqual(off);
    expect(off.map((r) => r.id)).toEqual(['d', 'a', 'b']);
  });

  it('lists only the account asked for', async () => {
    await pushedBeforeTheFlag();
    expect(await listOffsetBackfill('u2')).toEqual([
      {
        id: 'theirs',
        created_at: '2026-11-18T14:00:00.000Z',
        created_utc_offset_min: 540,
        title_edited_at: null,
        title_edited_utc_offset_min: null,
      },
    ]);
    expect(await listOffsetBackfill('nobody')).toEqual([]);
  });

  it('never lists a deleted prediction', async () => {
    await pushedBeforeTheFlag();
    await deletePrediction('a');
    expect((await listOffsetBackfill('u1')).map((r) => r.id)).toEqual(['d', 'b']);
  });

  it('never runs for the guest, whose rows never sync', async () => {
    mockOffsetSync = true;
    await insertPrediction(
      prediction({ id: 'guest', user_id: LOCAL_GUEST_USER_ID, created_utc_offset_min: NEW_YORK }),
    );
    await getDb().run(`UPDATE predictions SET dirty = 0 WHERE id = 'guest'`);
    const before = await allRaw();

    expect(await listOffsetBackfill(LOCAL_GUEST_USER_ID)).toEqual([]);
    expect(await offsetBackfillDone(LOCAL_GUEST_USER_ID)).toBe(true);
    await markOffsetBackfillDone(LOCAL_GUEST_USER_ID);
    expect(await markerRows()).toEqual([]);
    expect(await allRaw()).toEqual(before);
  });
});

describe('the backfill marker', () => {
  it('is set once per account, and setting it again changes nothing', async () => {
    mockOffsetSync = true;
    expect(await offsetBackfillDone('u1')).toBe(false);
    await markOffsetBackfillDone('u1');
    expect(await offsetBackfillDone('u1')).toBe(true);
    expect(await offsetBackfillDone('u2')).toBe(false);

    const [first] = await markerRows('u1');
    expect(first).toMatchObject({ user_id: 'u1', marker: OFFSET_BACKFILL_MARKER });
    await new Promise((r) => setTimeout(r, 5));
    await markOffsetBackfillDone('u1');
    expect(await markerRows('u1')).toEqual([first]);

    await markOffsetBackfillDone('u2');
    expect(await offsetBackfillDone('u2')).toBe(true);
    expect((await markerRows()).map((m) => m.user_id)).toEqual(['u1', 'u2']);
  });

  it('is never set while the flag is off, so the backfill waits for it', async () => {
    mockOffsetSync = false;
    await markOffsetBackfillDone('u1');
    expect(await offsetBackfillDone('u1')).toBe(false);
    expect(await markerRows()).toEqual([]);
  });

  it('changes no prediction', async () => {
    await pushedBeforeTheFlag();
    mockOffsetSync = true;
    const before = await allRaw();
    await markOffsetBackfillDone('u1');
    expect(await allRaw()).toEqual(before);
    expect(await listDirtyPredictionsSettled('u1')).toEqual([]);
    // The list is data, whatever the marker says: the caller reads the marker.
    expect((await listOffsetBackfill('u1')).map((r) => r.id)).toEqual(['d', 'a', 'b']);
  });

  // Sign-out keeps the marker: signing back in brings the rows down from the
  // server with the offsets it has. Erase and account deletion clear it.
  it("survives sign-out's wipe and goes with Erase", async () => {
    mockOffsetSync = true;
    await pushedBeforeTheFlag();
    await markOffsetBackfillDone('u1');
    await markOffsetBackfillDone('u2');

    await wipeLocalUserData('u1', { deviceData: false, keepIntegrityCounts: true });
    expect(await offsetBackfillDone('u1')).toBe(true);
    expect(await listOffsetBackfill('u1')).toEqual([]);

    await wipeLocalUserData('u1');
    expect(await offsetBackfillDone('u1')).toBe(false);
    expect(await offsetBackfillDone('u2')).toBe(true);
  });
});
