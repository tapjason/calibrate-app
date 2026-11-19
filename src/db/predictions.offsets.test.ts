// The UTC offsets stored with each moment of a prediction (owner decision
// 2026-11-19, SQLite migration 018): written with the moment they belong to,
// kept by a correction, and synced only once UTC_OFFSET_SYNC is on (it waits
// for the Supabase migration that adds the columns). Both flag states are
// tested here through a getter, since the helpers read the flag on each call.

import type { Prediction, PredictionWireRow } from '@/types';

import { getDb, setDbForTests } from './client';
import {
  answerSkippedPrediction,
  correctPredictionOutcome,
  getPrediction,
  insertPrediction,
  listDirtyPredictions,
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

  it('stores the answer with the time and offset it was given at', async () => {
    await insertPrediction(prediction({ created_utc_offset_min: NEW_YORK }));
    await resolvePrediction('p1', 'resolved_no', undefined, {
      at: '2026-11-19T03:00:00.000Z',
      utcOffsetMin: NEW_YORK,
    });
    expect(await getPrediction('p1')).toMatchObject({
      status: 'resolved_no',
      resolved_at: '2026-11-19T03:00:00.000Z',
      resolved_utc_offset_min: NEW_YORK,
    });
  });

  it("takes the device's offset when the caller states none (UTC under Jest)", async () => {
    await insertPrediction(prediction());
    await resolvePrediction('p1', 'resolved_yes');
    const offsets = await offsetsOf('p1');
    expect(offsets?.resolved_utc_offset_min).toBe(0);
    expect(Object.is(offsets?.resolved_utc_offset_min, 0)).toBe(true);
  });

  it("keeps the first answer's offset through a correction (D34)", async () => {
    await insertPrediction(prediction());
    await resolvePrediction('p1', 'resolved_yes', undefined, {
      at: '2026-11-19T03:00:00.000Z',
      utcOffsetMin: NEW_YORK,
    });
    await correctPredictionOutcome('p1', 'resolved_no');
    expect(await getPrediction('p1')).toMatchObject({
      status: 'resolved_no',
      resolved_at: '2026-11-19T03:00:00.000Z',
      resolved_utc_offset_min: NEW_YORK,
    });
  });

  it("gives a Can't tell answered later the new answer's offset", async () => {
    await insertPrediction(prediction());
    await resolvePrediction('p1', 'skipped', undefined, {
      at: '2026-11-19T03:00:00.000Z',
      utcOffsetMin: NEW_YORK,
    });
    expect((await offsetsOf('p1'))?.resolved_utc_offset_min).toBe(NEW_YORK);
    await answerSkippedPrediction('p1', 'resolved_yes', undefined, {
      at: '2026-11-21T09:00:00.000Z',
      utcOffsetMin: LONDON,
    });
    expect(await getPrediction('p1')).toMatchObject({
      resolved_at: '2026-11-21T09:00:00.000Z',
      resolved_utc_offset_min: LONDON,
    });
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
    await resolvePrediction('p1', 'resolved_yes', undefined, {
      at: '2026-11-19T03:00:00.000Z',
      utcOffsetMin: NEW_YORK,
    });
    // The server's copy: the same moments, written as Postgres writes them,
    // with an offset that must be ignored.
    await upsertPredictionFromRemote(
      wire({
        title: 'Renamed elsewhere',
        status: 'resolved_yes',
        created_at: '2026-11-18T14:00:00+00:00',
        resolved_at: '2026-11-19T03:00:00+00:00',
        resolved_utc_offset_min: 600,
      }),
    );
    expect(await offsetsOf('p1')).toEqual({
      created_utc_offset_min: NEW_YORK,
      resolved_utc_offset_min: NEW_YORK,
      title_edited_utc_offset_min: null,
    });
    expect((await getPrediction('p1'))?.title).toBe('Renamed elsewhere');
  });

  it('keeps no offset for a moment the pulled row changed, so it is read in the phone’s zone', async () => {
    await insertPrediction(prediction({ status: 'skipped', resolved_at: '2026-11-20T20:00:00.000Z', resolved_utc_offset_min: NEW_YORK }));
    // Answered on another phone later: a new answer time.
    await upsertPredictionFromRemote(
      wire({
        status: 'resolved_yes',
        resolved_at: '2026-11-22T10:00:00.000Z',
        resolved_utc_offset_min: LONDON,
        title_edited_at: '2026-11-19T10:00:00.000Z',
        title_edited_utc_offset_min: LONDON,
      }),
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
  it('puts all three on every pushed row, null included', async () => {
    await insertPrediction(prediction({ id: 'a', created_utc_offset_min: NEW_YORK }));
    await insertPrediction(prediction({ id: 'b' }));
    await resolvePrediction('b', 'resolved_yes', undefined, {
      at: '2026-11-19T03:00:00.000Z',
      utcOffsetMin: LONDON,
    });
    const byId = Object.fromEntries((await listDirtyPredictions('u1')).map((r) => [r.id, r]));
    expect(byId.a).toMatchObject({
      created_utc_offset_min: NEW_YORK,
      resolved_utc_offset_min: null,
      title_edited_utc_offset_min: null,
    });
    expect(byId.b).toMatchObject({
      created_utc_offset_min: null,
      resolved_utc_offset_min: LONDON,
      title_edited_utc_offset_min: null,
    });
    const union = new Set(Object.values(byId).flatMap((r) => Object.keys(r)));
    for (const row of Object.values(byId)) expect(new Set(Object.keys(row))).toEqual(union);
  });

  it("takes the winning row's offsets, null included", async () => {
    await insertPrediction(prediction({ created_utc_offset_min: NEW_YORK }));
    await upsertPredictionFromRemote(
      wire({
        status: 'resolved_no',
        resolved_at: '2026-11-19T10:00:00.000Z',
        created_utc_offset_min: null,
        resolved_utc_offset_min: LONDON,
        title_edited_utc_offset_min: null,
      }),
    );
    expect(await offsetsOf('p1')).toEqual({
      created_utc_offset_min: null,
      resolved_utc_offset_min: LONDON,
      title_edited_utc_offset_min: null,
    });
    // A pulled row with no keys at all (an older build's) reads as none.
    await upsertPredictionFromRemote(
      wire({ id: 'old', status: 'pending', updated_at: '2099-01-02T00:00:00.000Z' }),
    );
    expect((await offsetsOf('old'))?.created_utc_offset_min).toBeNull();
  });

  // Main session 2026-11-19: an answered row stands whole against a stale
  // open copy, its offsets included, whatever the copy carries.
  it("keeps an answered row's own offsets against a stale open copy", async () => {
    await insertPrediction(prediction({ created_utc_offset_min: NEW_YORK }));
    await resolvePrediction('p1', 'resolved_yes', undefined, {
      at: '2026-11-19T03:00:00.000Z',
      utcOffsetMin: NEW_YORK,
    });
    await upsertPredictionFromRemote(
      wire({
        status: 'pending',
        resolved_at: null,
        title_edited_at: '2026-11-20T09:00:00.000Z',
        created_utc_offset_min: LONDON,
        resolved_utc_offset_min: null,
        title_edited_utc_offset_min: LONDON,
      }),
    );
    expect(await offsetsOf('p1')).toEqual({
      created_utc_offset_min: NEW_YORK,
      resolved_utc_offset_min: NEW_YORK,
      title_edited_utc_offset_min: null,
    });
    expect(await getPrediction('p1')).not.toHaveProperty('title_edited_at');
  });

  it('stores an unusable pulled offset as none', async () => {
    await upsertPredictionFromRemote(wire({ id: 'bad', created_utc_offset_min: 5000 }));
    expect((await offsetsOf('bad'))?.created_utc_offset_min).toBeNull();
  });
});
