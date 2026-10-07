import type { CategoryStat, UserStat } from '@/types';

import { setDbForTests } from './client';
import {
  getCategoryStat,
  getUserStat,
  listCategoryStats,
  upsertCategoryStat,
  upsertUserStat,
} from './stats';
import { createTestDb } from './testing';

const userStat = (overrides: Partial<UserStat> = {}): UserStat => ({
  user_id: 'u1',
  calibration_rating: 0,
  total_predictions: 0,
  total_resolved: 0,
  current_streak: 0,
  rating_is_provisional: true,
  ...overrides,
});

const categoryStat = (overrides: Partial<CategoryStat> = {}): CategoryStat => ({
  user_id: 'u1',
  category: 'work',
  predictions_made: 0,
  predictions_resolved: 0,
  calibration_score: 0,
  score_is_provisional: true,
  badge_level: 'guesser',
  ...overrides,
});

beforeEach(async () => {
  setDbForTests(await createTestDb());
});

afterEach(() => {
  setDbForTests(null);
});

describe('user_stats db', () => {
  it('returns null when no row exists', async () => {
    expect(await getUserStat('u1')).toBeNull();
  });

  it('upserts and round-trips a UserStat, preserving the provisional flag', async () => {
    const s = userStat({
      calibration_rating: 72,
      total_resolved: 30,
      current_streak: 3,
      rating_is_provisional: false,
    });
    await upsertUserStat(s);
    expect(await getUserStat('u1')).toEqual(s);
  });

  it('upsert updates an existing row in place', async () => {
    await upsertUserStat(userStat({ calibration_rating: 50 }));
    await upsertUserStat(userStat({ calibration_rating: 75 }));
    const got = await getUserStat('u1');
    expect(got?.calibration_rating).toBe(75);
  });
});

describe('category_stats db', () => {
  it('returns null when no row exists', async () => {
    expect(await getCategoryStat('u1', 'work')).toBeNull();
  });

  it('upserts and round-trips a CategoryStat, preserving the provisional flag', async () => {
    const s = categoryStat({
      calibration_score: 88,
      score_is_provisional: false,
      badge_level: 'sharp',
    });
    await upsertCategoryStat(s);
    expect(await getCategoryStat('u1', 'work')).toEqual(s);
  });

  // The app's category order, as the store's recompute builds them: sorted by
  // the alphabet, Stats' badge rows changed places after the first log.
  it("lists all of a user's category stats, in the app's category order", async () => {
    await upsertCategoryStat(categoryStat({ category: 'personal' }));
    await upsertCategoryStat(categoryStat({ category: 'health' }));
    await upsertCategoryStat(categoryStat({ category: 'work' }));
    await upsertCategoryStat(categoryStat({ user_id: 'u2', category: 'finance' }));

    const list = await listCategoryStats('u1');
    expect(list.map((s) => `${s.user_id}/${s.category}`)).toEqual([
      'u1/work',
      'u1/health',
      'u1/personal',
    ]);
  });
});
