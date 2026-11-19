import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { APP_NAME } from '@/constants/app';
import { colors, space, type } from '@/constants/theme';
import { useLockStore } from '@/store/lockStore';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * What the Warm-up's first screen says about usage counts (D69 (b)), with
 * what they're for (policy re-audit L1, 2026-11-19: consent asked without the
 * purpose isn't informed).
 */
export const WARMUP_USAGE_NOTE = `${APP_NAME} sends a few usage counts, with no account or device id, to see how the app is used. You can turn this off here or in You.`;

/**
 * The line about usage counts on the Warm-up's first screen, with the same
 * Usage stats switch as You (owner decision 2026-11-19, D69 (b); guideline
 * 5.1.1(ii) asks for consent "even if … anonymous"). Nothing is sent before
 * it has been seen (`usageCountsMayGoUp`): drawn, it stamps when it was first
 * shown in the settings store (`markUsageNoticeShown`, kept across launches;
 * a second showing changes nothing). Not while the app lock covers it (D64):
 * drawn under the lock screen it hasn't been seen, so the stamp waits for the
 * unlock.
 *
 * One switch element, as You's rows are (roadmap step 41): VoiceOver hears
 * "Usage stats, switch", its state and the line, and the inner switch is
 * hidden from it. The switch sits on the line's first line, at the trailing
 * edge: centred on a block of several lines it lines up with none of them
 * (first device run, 2026-11-07).
 */
export function UsageStatsNotice() {
  const on = useSettingsStore((s) => s.analyticsEnabled);
  const setOn = useSettingsStore((s) => s.setAnalyticsEnabled);
  const markShown = useSettingsStore((s) => s.markUsageNoticeShown);
  const locked = useLockStore((s) => s.locked);

  // Once seen: on the first frame, or at the unlock if it was drawn under the
  // lock screen. The store keeps the first stamp, so this writes once.
  useEffect(() => {
    if (!locked) void markShown();
  }, [locked, markShown]);

  const change = (next: boolean) => void setOn(next);

  return (
    <Pressable
      style={styles.row}
      onPress={() => change(!on)}
      accessibilityRole="switch"
      accessibilityLabel="Usage stats"
      accessibilityHint={WARMUP_USAGE_NOTE}
      accessibilityState={{ checked: on }}
      // The cross-platform prop as well: react-native-web maps this one.
      aria-checked={on}
      testID="warmup-usage-row"
    >
      <Text style={styles.line} testID="warmup-usage-note">
        {WARMUP_USAGE_NOTE}
      </Text>
      <ToggleSwitch
        value={on}
        onValueChange={change}
        testID="warmup-usage-switch"
        style={styles.switch}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

/** The iOS 26 switch's height, which the line's first line is centred on. */
const SWITCH_HEIGHT = 28;

const styles = StyleSheet.create({
  // The line and the switch side by side, both from the top: the switch on
  // the first line, not centred on the block.
  row: {
    alignItems: 'flex-start',
    columnGap: space.md,
    flexDirection: 'row',
    marginTop: space.sm,
  },
  // Centres the first line (18 pt) on the switch (28 pt).
  line: {
    ...type.footnote,
    color: colors.textSecondary,
    flex: 1,
    marginTop: (SWITCH_HEIGHT - type.footnote.lineHeight) / 2,
  },
  switch: { flexShrink: 0 },
});
