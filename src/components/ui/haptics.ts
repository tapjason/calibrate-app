import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * The app's haptic vocabulary (DESIGN_SYSTEM §6.1). One fixed meaning per
 * pattern, per the HIG ("use system-provided patterns according to their
 * documented meanings"), and every haptic has a visual twin.
 *
 * Fire-and-forget and fail-silent: a haptic that can't play (web, a device
 * without an engine, Low Power Mode) must never break the action it
 * accompanies.
 */

function play(effect: () => Promise<void>): void {
  if (Platform.OS === 'web') return;
  effect().catch(() => undefined);
}

export const haptics = {
  /** One step of a stepped control: the confidence slider, a picker. */
  detent: () => play(() => Haptics.selectionAsync()),
  /** Saving a prediction. */
  commit: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /**
   * Recording an outcome. Identical for Yes and No (rule 0.4) — a No is not
   * an error, so it never gets the Error or Warning pattern.
   */
  resolve: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** The last dot of a reveal landing (Warmup verdict chart). */
  reveal: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  /**
   * Reserved for unlocks, badge tier-ups and the larger streak checkpoints
   * (§6.2, `checkpoint` below). Never for a Yes.
   */
  unlock: () =>
    play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /**
   * A streak checkpoint's moment landing (step 194, D67; FUTURE_UI B1): the
   * `reveal` tap (Rigid) at 7 and 30 days, Success from 100 on, so the
   * pattern grows with the milestone and the larger ones join the unlock's.
   */
  checkpoint: (major: boolean) =>
    play(() =>
      major
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
    ),
};
