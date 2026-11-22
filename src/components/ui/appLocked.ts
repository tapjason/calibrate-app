import { useLockStore } from '@/store/lockStore';

/**
 * Whether the app lock (D64) is up, read at the moment of a press.
 *
 * A system alert (`Alert.alert`) is drawn in a window of its own, above the
 * app's window and so above the lock screen (React Native's
 * RCTAlertController, at UIWindowLevelAlert + 1). iOS doesn't close it when
 * the app goes to the background, and React Native can't: one left up when
 * the person went Home is still there, and its buttons still work, when
 * someone else opens the app to the lock screen, before any Unlock (security
 * review, 2026-11-18; since D74 nothing asks for Face ID until Unlock is
 * tapped). An action sheet is presented in the app's own window, under
 * a lock drawn after it, but gets the same check.
 *
 * So every alert or action-sheet button that deletes, erases, discards or
 * saves does nothing while this is true. Read it in the handler itself,
 * never once at render: the lock can come down between the two.
 */
export function appLocked(): boolean {
  return useLockStore.getState().locked;
}
