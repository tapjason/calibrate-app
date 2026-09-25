import type { Prediction } from '@/types';

import { enqueueEvent, listUnsyncedEvents } from './analytics';
import { setDbForTests, getDb } from './client';
import {
  LOCAL_GUEST_USER_ID,
  migrateGuestDataToUser,
} from './migrateGuestData';
import { insertPrediction, listPendingPredictions } from './predictions';
import { upsertUserStat, getUserStat, upsertCategoryStat } from './stats';
import { createTestDb } from './testing';

const p = (overrides: Partial<Prediction> = {}): Prediction => ({
  id: 'p',
  user_id: LOCAL_GUEST_USER_ID,
  title: 't',
  category: 'work',
  confidence: 50,
  created_at: '2026-01-01T00:00:00.000Z',
  due_date: '2026-02-01T00:00:00.000Z',
  status: 'pending',
  resolved_at: null,
  reflection: null,
  integrity_bonus: false,
  ...overrides,
});

beforeEach(async () => {
  setDbForTests(await createTestDb());
});

afterEach(() => {
  setDbForTests(null);
});

describe('migrateGuestDataToUser', () => {
  it('moves every guest-owned prediction to the new user_id', async () => {
    await insertPrediction(p({ id: 'a' }));
    await insertPrediction(p({ id: 'b', category: 'health' }));

    const result = await migrateGuestDataToUser('real-user');

    expect(result.predictionsMoved).toBe(2);
    const guestList = await listPendingPredictions(LOCAL_GUEST_USER_ID);
    expect(guestList).toHaveLength(0);
    const realList = await listPendingPredictions('real-user');
    expect(realList).toHaveLength(2);
  });

  it('deletes guest stats so the caller can recompute cleanly', async () => {
    await insertPrediction(p({ id: 'a' }));
    await upsertUserStat({
      user_id: LOCAL_GUEST_USER_ID,
      calibration_rating: 50,
      total_predictions: 1,
      total_resolved: 0,
      current_streak: 0,
      rating_is_provisional: true,
    });
    await upsertCategoryStat({
      user_id: LOCAL_GUEST_USER_ID,
      category: 'work',
      predictions_made: 1,
      predictions_resolved: 0,
      calibration_score: 0,
      score_is_provisional: true,
      badge_level: 'guesser',
    });

    await migrateGuestDataToUser('real-user');

    expect(await getUserStat(LOCAL_GUEST_USER_ID)).toBeNull();
    expect(await getUserStat('real-user')).toBeNull();
  });

  it('also clears pre-existing stats for the destination user (PK collision guard)', async () => {
    // A returning user signs back in: they already have a user_stats row from
    // a prior session. Migration must drop it so the caller's recompute can
    // INSERT cleanly without hitting the PRIMARY KEY constraint.
    await insertPrediction(p({ id: 'a' }));
    await upsertUserStat({
      user_id: 'real-user',
      calibration_rating: 99,
      total_predictions: 50,
      total_resolved: 50,
      current_streak: 7,
      rating_is_provisional: false,
    });

    await migrateGuestDataToUser('real-user');

    expect(await getUserStat('real-user')).toBeNull();
  });

  it('is a safe no-op when there is no guest data', async () => {
    const result = await migrateGuestDataToUser('real-user');
    expect(result.predictionsMoved).toBe(0);
  });

  // The Warmup is the first-run screen, so it is always recorded as a guest.
  // Left under the guest id those events could never be sent — no session can
  // insert as 'local-user-v1' — and the D0 aha metric would read NULL forever.
  it('hands queued guest analytics events to the new user', async () => {
    const ev = (id: string, user_id: string) => ({
      id,
      user_id,
      name: 'warmup_started',
      props: {},
      created_at: '2026-01-01T00:00:00.000Z',
    });
    await enqueueEvent(ev('g1', LOCAL_GUEST_USER_ID));
    await enqueueEvent(ev('g2', LOCAL_GUEST_USER_ID));
    await enqueueEvent(ev('x1', 'previous-account'));

    await migrateGuestDataToUser('real-user');

    await expect(listUnsyncedEvents(LOCAL_GUEST_USER_ID, 10)).resolves.toEqual([]);
    const moved = await listUnsyncedEvents('real-user', 10);
    expect(moved.map((e) => e.id).sort()).toEqual(['g1', 'g2']);
    // Only the guest's events move; another account's stay that account's.
    await expect(listUnsyncedEvents('previous-account', 10)).resolves.toHaveLength(1);
  });

  it('refuses to migrate to the guest id (would be a self-loop)', async () => {
    await expect(
      migrateGuestDataToUser(LOCAL_GUEST_USER_ID),
    ).rejects.toThrow(/guest user id/i);
  });

  it('rolls back if any statement inside the transaction fails', async () => {
    await insertPrediction(p({ id: 'a' }));
    // Break the adapter's run() so the UPDATE throws mid-flight.
    const db = getDb();
    const realRun = db.run.bind(db);
    db.run = async (sql, params) => {
      if (sql.includes('UPDATE predictions')) {
        throw new Error('forced failure');
      }
      return realRun(sql, params);
    };

    await expect(migrateGuestDataToUser('real-user')).rejects.toThrow(
      /forced failure/,
    );

    // Restore so afterEach can clean up.
    db.run = realRun;

    // The prediction must still belong to the guest — UPDATE was rolled back.
    const guestList = await listPendingPredictions(LOCAL_GUEST_USER_ID);
    expect(guestList).toHaveLength(1);
  });
});
