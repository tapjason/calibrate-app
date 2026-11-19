// What a sign-out would lose for good, and whether what the person agreed to
// lose covers it (round 6, client re-review N1 and N2). The rules are pure;
// the read runs against the test database.

import { setDbForTests } from '@/db/client';
import { upsertCategoryDef } from '@/db/categories';
import {
  deletePrediction,
  getPredictionUpdatedAt,
  insertPrediction,
  markPredictionSynced,
} from '@/db/predictions';
import { createTestDb } from '@/db/testing';
import type { Prediction } from '@/types';

import {
  agreedCovers,
  anythingAtStake,
  NOTHING_AT_STAKE,
  readAtStake,
  type AtStake,
} from './signOutCheck';
import { __resetSyncStateForTests } from './sync';

const USER = 'user-aaa';

const stake = (unsynced: number, localCategories: number, rows: Record<string, string> = {}): AtStake => ({
  unsynced,
  localCategories,
  rows: new Map(Object.entries(rows)),
});

describe('agreedCovers', () => {
  it('nothing agreed covers only nothing', () => {
    expect(agreedCovers(NOTHING_AT_STAKE, NOTHING_AT_STAKE)).toBe(true);
    expect(agreedCovers(NOTHING_AT_STAKE, stake(1, 0, { a: 't1' }))).toBe(false);
    expect(agreedCovers(NOTHING_AT_STAKE, stake(1, 0))).toBe(false);
    expect(agreedCovers(NOTHING_AT_STAKE, stake(0, 1))).toBe(false);
  });

  it('covers what was agreed, and less of it', () => {
    const agreed = stake(2, 1, { a: 't1', b: 't2' });
    expect(agreedCovers(agreed, agreed)).toBe(true);
    expect(agreedCovers(agreed, stake(1, 1, { a: 't1' }))).toBe(true);
    expect(agreedCovers(agreed, stake(0, 0))).toBe(true);
  });

  it('not a change it was never told about, even at the same count', () => {
    const agreed = stake(1, 0, { a: 't1' });
    expect(agreedCovers(agreed, stake(2, 0, { a: 't1', b: 't2' }))).toBe(false);
    expect(agreedCovers(agreed, stake(1, 0, { b: 't2' }))).toBe(false);
    expect(agreedCovers(agreed, stake(1, 0, { a: 't9' }))).toBe(false);
  });

  it('not a higher count of either kind', () => {
    expect(agreedCovers(stake(1, 1), stake(2, 1))).toBe(false);
    expect(agreedCovers(stake(1, 1), stake(1, 2))).toBe(false);
  });

  it('anythingAtStake says whether there is anything to ask about', () => {
    expect(anythingAtStake(NOTHING_AT_STAKE)).toBe(false);
    expect(anythingAtStake(stake(1, 0))).toBe(true);
    expect(anythingAtStake(stake(0, 1))).toBe(true);
  });
});

describe('readAtStake', () => {
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

  beforeEach(async () => {
    setDbForTests(await createTestDb());
    __resetSyncStateForTests();
  });

  afterEach(() => {
    setDbForTests(null);
  });

  it('reads the dirty rows, the count of changes and the categories only this phone has', async () => {
    await insertPrediction(prediction('dirty-1'));
    await insertPrediction(prediction('synced-1'));
    await markPredictionSynced('synced-1', (await getPredictionUpdatedAt('synced-1'))!);
    await insertPrediction(prediction('gone-1'));
    await deletePrediction('gone-1');
    await upsertCategoryDef({
      id: 'c-garden',
      user_id: USER,
      name: 'Garden',
      icon: null,
      hidden: false,
      position: 0,
      created_at: '2026-05-01T00:00:00.000Z',
    });

    const atStake = await readAtStake(USER);
    expect([...atStake.rows.keys()]).toEqual(['dirty-1']);
    // The dirty row and the deletion not yet pushed (`countUnsynced`).
    expect(atStake.unsynced).toBe(2);
    expect(atStake.localCategories).toBe(1);

    await expect(readAtStake('user-bbb')).resolves.toEqual(NOTHING_AT_STAKE);
  });

  it('throws when it cannot read, so nothing is decided on a guess', async () => {
    setDbForTests(null);
    await expect(readAtStake(USER)).rejects.toThrow();
  });
});
