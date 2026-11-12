// Puts one playtest profile (playtestProfiles.ts) on this device, in place of
// whatever was there. Development only: the one caller is /dev/seed.

import { upsertCategoryDef } from '@/db/categories';
import { withTransaction } from '@/db/client';
import { insertPrediction } from '@/db/predictions';
import { useAuthStore } from '@/store/authStore';
import { useCategoryStore } from '@/store/categoryStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { useWarmupStore } from '@/store/warmupStore';

import { buildProfile, type ProfileId } from './playtestProfiles';

/** The Warm-up's answers, the same every time. */
const WARMUP_PICKS = [0, 1, 1, 0, 0, 1, 0, 1, 1, 0];
const WARMUP_CONFIDENCES = [70, 80, 60, 90, 75, 65, 85, 70, 95, 60];

/**
 * Erases this device's data (as You → Erase all data does, so guest only),
 * puts every setting back to a fresh install's, finishes the Warm-up, then writes the profile's predictions and categories
 * and reloads the stores. Returns how many predictions it wrote. Open ones
 * get their reminders as usual (the scheduler follows the pending list).
 * The erase and the Warm-up are committed first, so a failed write leaves an
 * empty device past the Warm-up.
 *
 * Development only and outside the stores on purpose (app-profile §4): it
 * stitches several stores together the way You → Erase all data does.
 */
export async function loadPlaytestProfile(id: ProfileId, now = new Date()): Promise<number> {
  if (__DEV__ !== true) throw new Error('Development builds only.');
  const auth = useAuthStore.getState();
  if (auth.status !== 'guest' || !auth.userId) {
    throw new Error('Sign out first: a profile replaces the data on this device.');
  }
  const erased = await auth.eraseDeviceData();
  if (!erased.ok) throw new Error(erased.error);
  // Erase keeps settings; a profile starts from a fresh install's (blind
  // playtest 2026-11-12b, finding 24: one tester's card left-offs reached the
  // next).
  await useSettingsStore.getState().resetToDefaults();

  const warmup = useWarmupStore.getState();
  await warmup.hydrate();
  // Until it's done, however many questions it has; a bound so it can't spin.
  for (let i = 0; i < 100 && !useWarmupStore.getState().completedAt; i++) {
    await useWarmupStore
      .getState()
      .answer(WARMUP_PICKS[i % WARMUP_PICKS.length], WARMUP_CONFIDENCES[i % WARMUP_CONFIDENCES.length]);
  }
  if (!useWarmupStore.getState().completedAt) throw new Error('The Warm-up didn’t finish.');

  const userId = auth.userId;
  const { predictions, categories } = buildProfile(id, userId, now, now.getTime().toString(36));
  await withTransaction(async () => {
    for (const c of categories) await upsertCategoryDef(c);
    for (const p of predictions) await insertPrediction(p);
    await useStatsStore.getState().recomputeForUser(userId);
  });
  await Promise.all([
    useCategoryStore.getState().load(),
    usePredictionStore.getState().loadPending(),
    usePredictionStore.getState().loadResolved(),
    useStatsStore.getState().loadForUser(userId),
  ]);
  return predictions.length;
}
