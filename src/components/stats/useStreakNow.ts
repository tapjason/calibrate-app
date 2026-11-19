import { useLocalDay } from '@/components/ui/useLocalDay';
import { usePredictionStore } from '@/store/predictionStore';
import type { StreakStatus } from '@/types';

/**
 * Where the streak stands now, read the way Today reads it: the prediction
 * store's `streakNow()` at render, again after each log or answer (the lists
 * it walks) and when the local day turns (`useLocalDay`).
 *
 * `userStat.current_streak` is computed only when something is written, so
 * after a day with nothing logged or answered it still held a streak that had
 * ended: Insights' count line and the recap showed it while Today's row said
 * it had ended (record audit, 2026-11-18; R11). Every surface that shows the
 * streak reads it through here, or through `streakNow()` itself.
 */
export function useStreakNow(): StreakStatus {
  // Subscribed so a log or an answer re-reads it, as on Today.
  usePredictionStore((s) => s.pending);
  usePredictionStore((s) => s.resolved);
  // And when the date turns, with nothing written: a tab stays mounted.
  useLocalDay();
  return usePredictionStore.getState().streakNow();
}
