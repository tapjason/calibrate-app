import type { Prediction } from '@/types';

import { wipeLocalUserData } from './account';
import { enqueueEvent, listUnsyncedEvents } from './analytics';
import { getDb, setDbForTests } from './client';
import { insertPrediction, listPendingPredictions } from './predictions';
import { getUserStat, listCategoryStats, upsertCategoryStat, upsertUserStat } from './stats';
import { createTestDb } from './testing';

const p = (id: string, user_id: string): Prediction => ({
  id,
  user_id,
  title: 't',
  category: 'work',
  confidence: 50,
  created_at: '2026-01-01T00:00:00.000Z',
  due_date: '2026-02-01T00:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
});

async function seedUser(userId: string): Promise<void> {
  await insertPrediction(p(`${userId}-a`, userId));
  await upsertUserStat({
    user_id: userId,
    calibration_rating: 50,
    total_predictions: 1,
    total_resolved: 0,
    current_streak: 0,
    rating_is_provisional: true,
  });
  await upsertCategoryStat({
    user_id: userId,
    category: 'work',
    predictions_made: 1,
    predictions_resolved: 0,
    calibration_score: 0,
    score_is_provisional: true,
    badge_level: 'guesser',
  });
  await enqueueEvent({
    id: `${userId}-e`,
    user_id: userId,
    name: 'prediction_logged',
    props: {},
    created_at: '2026-01-01T00:00:00.000Z',
  });
}

beforeEach(async () => {
  setDbForTests(await createTestDb());
});

afterEach(() => {
  setDbForTests(null);
});

describe('wipeLocalUserData', () => {
  it("removes the user's predictions, stats and queued events", async () => {
    await seedUser('me');

    await wipeLocalUserData('me');

    await expect(listPendingPredictions('me')).resolves.toEqual([]);
    await expect(getUserStat('me')).resolves.toBeNull();
    await expect(listCategoryStats('me')).resolves.toEqual([]);
    await expect(listUnsyncedEvents('me', 10)).resolves.toEqual([]);
  });

  // Sign-out keeps an account's rows on the device for when that person signs
  // back in. Deleting your account must not delete theirs.
  it("leaves another account's rows alone", async () => {
    await seedUser('me');
    await seedUser('someone-else');

    await wipeLocalUserData('me');

    await expect(listPendingPredictions('someone-else')).resolves.toHaveLength(1);
    await expect(getUserStat('someone-else')).resolves.not.toBeNull();
    await expect(listUnsyncedEvents('someone-else', 10)).resolves.toHaveLength(1);
  });

  it('rolls back entirely if any delete fails', async () => {
    await seedUser('me');
    const db = getDb();
    const realRun = db.run.bind(db);
    db.run = async (sql, params) => {
      if (sql.includes('DELETE FROM analytics_events')) throw new Error('forced failure');
      return realRun(sql, params);
    };

    await expect(wipeLocalUserData('me')).rejects.toThrow(/forced failure/);
    db.run = realRun;

    // The predictions delete ran first and was rolled back with the rest.
    await expect(listPendingPredictions('me')).resolves.toHaveLength(1);
  });
});
