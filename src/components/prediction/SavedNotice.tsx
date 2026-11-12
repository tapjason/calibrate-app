import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { colors, elevation, radius, space, type } from '@/constants/theme';

/** How long the sign stays, in ms: long enough to read twice. */
export const SAVED_NOTICE_MS = 3500;

/**
 * "Saved, due tomorrow." over the tab a Log sheet closed back to, when that
 * tab isn't Today (Today scrolls to the new card instead, D48). Blind
 * playtests 2026-11-12c and -12d: a save from Insights or History closed to an
 * unchanged screen, and four testers didn't know whether it had worked.
 * Not pressable and not in the way: it sits above the tab bar and goes by
 * itself; VoiceOver hears it once.
 */
export function SavedNotice({
  text,
  bottom,
  onDone,
}: {
  text: string;
  /** Distance from the screen's bottom edge, above the tab bar. */
  bottom: number;
  onDone: () => void;
}) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(text);
    const t = setTimeout(onDone, SAVED_NOTICE_MS);
    return () => clearTimeout(t);
  }, [text, onDone]);

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { bottom }]}
      testID="saved-notice"
      // Announced above; the view itself stays out of the reading order.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.pill}>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    alignItems: 'center',
  },
  pill: {
    ...elevation.e1,
    backgroundColor: colors.action,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    maxWidth: '100%',
  },
  text: {
    ...type.body,
    color: colors.onAction,
    textAlign: 'center',
  },
});
