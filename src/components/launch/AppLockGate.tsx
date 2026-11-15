import { useContext, useEffect, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { Button } from '@/components/ui/Button';
import { APP_NAME } from '@/constants/app';
import { colors, DISPLAY_MAX_SCALE, space, type } from '@/constants/theme';
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
 */
export function AppLockGate() {
  const locked = useLockStore((s) => s.locked);
  const covered = useLockStore((s) => s.covered);
  const checking = useLockStore((s) => s.checking);
  const notice = useLockStore((s) => s.notice);
  const method = useLockStore((s) => s.method);
  const unlock = useLockStore((s) => s.unlock);
  const continueWithoutLock = useLockStore((s) => s.continueWithoutLock);
  // Zero where nothing provides them (tests); the router provides them in the app.
  const insets = useContext(SafeAreaInsetsContext);

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
    <Overlay>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.fill,
          {
            paddingTop: space.xxl + (insets?.top ?? 0),
            paddingBottom: space.xxl + (insets?.bottom ?? 0),
          },
        ]}
        alwaysBounceVertical={false}
        keyboardShouldPersistTaps="handled"
        testID={locked ? 'app-lock' : 'app-lock-cover'}
      >
        <Text
          style={styles.name}
          accessibilityRole="header"
          maxFontSizeMultiplier={DISPLAY_MAX_SCALE}
        >
          {APP_NAME}
        </Text>
        {locked && (
          <View style={styles.body}>
            {notice === 'no_passcode' ? (
              <>
                <Text style={styles.line} testID="app-lock-no-passcode">
                  {NO_PASSCODE_LINE}
                </Text>
                <Button
                  label="Continue"
                  onPress={() => void continueWithoutLock()}
                  testID="app-lock-continue"
                />
              </>
            ) : (
              <>
                <Text style={styles.line}>{lockedLine(method)}</Text>
                {notice === 'failed' && (
                  <Text style={styles.line} testID="app-lock-failed">
                    {FAILED_LINE}
                  </Text>
                )}
                <Button
                  label="Unlock"
                  onPress={() => void unlock()}
                  disabled={checking}
                  testID="app-lock-unlock"
                />
              </>
            )}
          </View>
        )}
      </ScrollView>
    </Overlay>
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

/** In front of every sheet on the iPhone; an absolute layer where there are none. */
function Overlay({ children }: { children: ReactNode }) {
  if (Platform.OS === 'ios') {
    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal>{children}</FullWindowOverlay>
    );
  }
  return <View style={StyleSheet.absoluteFill}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  fill: {
    alignItems: 'center',
    flexGrow: 1,
    gap: space.xl,
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  name: { ...type.title1, color: colors.textPrimary, textAlign: 'center' },
  body: { alignSelf: 'stretch', gap: space.lg },
  line: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
});
