import { useEffect } from 'react';
import { AccessibilityInfo, AppState, Keyboard, StyleSheet, View } from 'react-native';

import { InFront, LaunchButton, LaunchLine, LaunchPage } from '@/components/launch/LaunchPage';
import { space } from '@/constants/theme';
import { useLockStore } from '@/store/lockStore';

export const NO_PASSCODE_LINE =
  'This iPhone has no passcode now, so there is nothing to check. The lock is off until you turn it on again in You.';
export const FAILED_LINE = 'That didn’t unlock it. Try again.';

/**
 * The app lock's screen and its cover (roadmap D64, step 180). Rendered once,
 * beside the navigator in the root layout, and drawn over everything.
 *
 * - **Locked:** the app's name, "Locked", and Unlock. iOS's own prompt opens
 *   by itself once per lock; Unlock asks again after a prompt that was closed.
 * - **Covered:** the lock is on and the app isn't in front (the app switcher,
 *   Notification Center, a system alert): the name alone, so the switcher's
 *   picture of the app shows no prediction.
 *
 * On the iPhone it is a `FullWindowOverlay`: a view added to the app's window
 * and kept in front of whatever is presented after it, since a view in the
 * root layout would be drawn under an open sheet, and Log, Resolve and the
 * details are all sheets. VoiceOver is kept inside it. Not above it: the
 * keyboard and a system alert, which have windows of their own.
 *
 * It scrolls: at the largest text sizes the lines and the button are taller
 * than the screen, and the button is the way in (code review of step 180).
 *
 * Since step 187 it is the launch page (`LaunchPage`): the mark and the name
 * on the splash's ink, with the lock's line and button under them, so
 * opening the app and unlocking it look like one thing.
 */
export function AppLockGate() {
  const locked = useLockStore((s) => s.locked);
  const covered = useLockStore((s) => s.covered);
  const checking = useLockStore((s) => s.checking);
  const notice = useLockStore((s) => s.notice);
  const method = useLockStore((s) => s.method);
  const unlock = useLockStore((s) => s.unlock);
  const continueWithoutLock = useLockStore((s) => s.continueWithoutLock);
  // The store follows the app in and out of the foreground from here, so it
  // needs nothing from react-native itself. The first call covers a launch:
  // a lock armed before this mounted gets its one prompt once the app is active.
  useEffect(() => {
    useLockStore.getState().appPhaseChanged(AppState.currentState);
    const sub = AppState.addEventListener('change', (next) => {
      useLockStore.getState().appPhaseChanged(next);
    });
    return () => sub.remove();
  }, []);

  // A keyboard would sit over the lock, in its own window: one left up when
  // the app locked, or raised by a field focused underneath it later.
  useEffect(() => {
    if (!locked) return undefined;
    Keyboard.dismiss();
    const sub = Keyboard.addListener('keyboardDidShow', () => Keyboard.dismiss());
    return () => sub.remove();
  }, [locked]);

  // Said aloud: a live region is Android's, and VoiceOver would hear nothing
  // change (code review of step 180).
  useEffect(() => {
    if (!locked || notice === null) return;
    AccessibilityInfo.announceForAccessibility(
      notice === 'no_passcode' ? NO_PASSCODE_LINE : FAILED_LINE,
    );
  }, [locked, notice]);

  if (!locked && !covered) return null;

  return (
    <InFront modal>
      <LaunchPage testID={locked ? 'app-lock' : 'app-lock-cover'}>
        {locked && (
          <View style={styles.body}>
            {notice === 'no_passcode' ? (
              <>
                <LaunchLine testID="app-lock-no-passcode">{NO_PASSCODE_LINE}</LaunchLine>
                <LaunchButton
                  label="Continue"
                  onPress={() => void continueWithoutLock()}
                  testID="app-lock-continue"
                />
              </>
            ) : (
              <>
                <LaunchLine>{lockedLine(method)}</LaunchLine>
                {notice === 'failed' && (
                  <LaunchLine testID="app-lock-failed">{FAILED_LINE}</LaunchLine>
                )}
                <LaunchButton
                  label="Unlock"
                  onPress={() => void unlock()}
                  disabled={checking}
                  testID="app-lock-unlock"
                />
              </>
            )}
          </View>
        )}
      </LaunchPage>
    </InFront>
  );
}

/** What the lock screen says under the name, by how this phone unlocks. */
export function lockedLine(method: 'Face ID' | 'Touch ID' | 'your passcode' | null): string {
  if (method === 'Face ID' || method === 'Touch ID') {
    return `Locked. Unlock with ${method} or your iPhone passcode to see your predictions.`;
  }
  if (method === 'your passcode') {
    return 'Locked. Unlock with your iPhone passcode to see your predictions.';
  }
  return 'Locked. Unlock to see your predictions.';
}

const styles = StyleSheet.create({
  body: { alignSelf: 'stretch', gap: space.lg, marginTop: space.xl },
});
