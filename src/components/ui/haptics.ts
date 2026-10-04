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
  /** Reserved for unlocks and badge tier-ups (§6.2). Never for a Yes. */
  unlock: () =>
    play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
