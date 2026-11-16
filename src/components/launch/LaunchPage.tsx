import { useContext, type ReactNode } from 'react';
import {
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { useAppearance, type AppearanceName } from '@/components/ui/useAppearance';
import { APP_NAME } from '@/constants/app';
import { DISPLAY_MAX_SCALE, palettes, radius, space, type } from '@/constants/theme';

// The splash's own picture, so the page the native splash fades to is the one
// it was showing.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MARK = require('../../../assets/images/splash-icon.png');

/** The native splash draws the mark this wide (`imageWidth` in app.json), centred. */
export const MARK_SIZE = 200;

/**
 * The splash's ink (`app.json`): the same two colours, so the hand-over from
 * the native splash moves nothing.
 */
export function launchInk(scheme: AppearanceName): string {
  return scheme === 'dark' ? palettes.dark.canvas : palettes.light.action;
}

// The page is ink in both appearances, so what sits on it uses the dark
// palette's values in both, as a share card keeps its own (CLAUDE.md, Visual
// design).
const ON_INK = palettes.dark;

interface LaunchPageProps {
  /** The name's opacity, when it fades in; shown plainly without it. */
  nameOpacity?: Animated.Value;
  /** Leave the name off: the page as the native splash draws it. */
  markOnly?: boolean;
  /** Under the name: the app lock's line and button. */
  children?: ReactNode;
  testID?: string;
}

/**
 * The launch page (step 187, the owner's request on the first TestFlight
 * build): the mark and the app's name on the splash's ink. One page for three
 * moments, so they read as one: the launch (`LaunchScreen`), the app lock and
 * its cover in the app switcher (`AppLockGate`), and the wait before the
 * database opens.
 *
 * The mark sits where the native splash draws it, in the middle of the
 * screen at the same size. Everything else hangs under it and the page
 * scrolls: at the largest text sizes the lock's lines and button are taller
 * than half a screen, and the button is the way in.
 */
export function LaunchPage({ nameOpacity, markOnly, children, testID }: LaunchPageProps) {
  const scheme = useAppearance();
  const { height } = useWindowDimensions();
  // Zero where nothing provides them (tests, the wait before the navigator).
  const insets = useContext(SafeAreaInsetsContext);
  const top = Math.max((insets?.top ?? 0) + space.lg, height / 2 - MARK_SIZE / 2);

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: launchInk(scheme) }]}
      contentContainerStyle={[
        styles.fill,
        { paddingTop: top, paddingBottom: space.xxl + (insets?.bottom ?? 0) },
      ]}
      alwaysBounceVertical={false}
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      <Image
        source={MARK}
        style={styles.mark}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID="launch-mark"
      />
      {!markOnly && (
        <Animated.Text
          style={[styles.name, nameOpacity ? { opacity: nameOpacity } : null]}
          accessibilityRole="header"
          maxFontSizeMultiplier={DISPLAY_MAX_SCALE}
        >
          {APP_NAME}
        </Animated.Text>
      )}
      {children}
    </ScrollView>
  );
}

/** A line under the name, in the page's own secondary ink. */
export function LaunchLine({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <Text style={styles.line} testID={testID}>
      {children}
    </Text>
  );
}

interface LaunchButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * The page's one button: `Button`'s capsule in the page's fixed colours. The
 * app's own primary is ink in the light appearance, which would vanish here.
 */
export function LaunchButton({ label, onPress, disabled, testID }: LaunchButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        disabled ? styles.buttonDisabled : pressed ? styles.buttonPressed : null,
      ]}
      testID={testID}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * In front of every screen and sheet on the iPhone (a view in the app's
 * window, kept above whatever is presented after it); an absolute layer where
 * there are no sheets. `modal` keeps VoiceOver inside it.
 */
export function InFront({ children, modal }: { children: ReactNode; modal?: boolean }) {
  if (Platform.OS === 'ios') {
    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal={!!modal}>
        {children}
      </FullWindowOverlay>
    );
  }
  return <View style={StyleSheet.absoluteFill}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { alignItems: 'center', flexGrow: 1, paddingHorizontal: space.xxl },
  mark: { height: MARK_SIZE, width: MARK_SIZE },
  // The picture has clear space under the mark; the name tucks into it.
  name: {
    ...type.title1,
    color: ON_INK.textPrimary,
    marginTop: -space.xxxl,
    textAlign: 'center',
  },
  line: { ...type.body, color: ON_INK.textSecondary, textAlign: 'center' },
  button: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: ON_INK.action,
    borderRadius: radius.pill,
    justifyContent: 'center',
    // 44pt: Apple's minimum comfortable tap target, as `Button`.
    minHeight: 44,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  buttonPressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { ...type.headline, color: ON_INK.onAction, textAlign: 'center' },
});
