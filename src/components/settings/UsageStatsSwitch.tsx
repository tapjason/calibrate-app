import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { colors, space, type } from '@/constants/theme';
import { useSettingsStore } from '@/store/settingsStore';

interface UsageStatsSwitchProps {
  /** What the line says while usage stats are on. */
  noteOn: string;
  /** What it says while they are off; the same line when left out. */
  noteOff?: string;
  /** The line's size: the Warm-up's `footnote`, or the sign-in screen's `subhead`. */
  size?: 'footnote' | 'subhead';
  /** The prefix of `-row` (the switch element), `-note` (the line shown) and `-switch`. */
  testID: string;
}

/**
 * A line about usage counts beside the Usage stats switch: the same setting
 * as You's switch (`analyticsEnabled`), for the Warm-up's first screen
 * (`UsageStatsNotice`, D69 (b)) and the sign-in screen (decision 9,
 * 2026-11-19), so the two can't drift. It follows the settings store, so a
 * record that couldn't be read shows it off, as the store holds it then.
 *
 * One switch element, as You's rows are (roadmap step 41): VoiceOver hears
 * "Usage stats, switch", its state and the line shown, and the inner switch
 * is hidden from it. The switch sits on the line's first line, at the
 * trailing edge: centred on a block of several lines it lines up with none of
 * them (first device run, 2026-11-07).
 *
 * With a different line for each state, the longer one always holds the
 * line's height (drawn invisible while the other is said, and hidden from
 * VoiceOver), so flipping the switch moves nothing under it.
 */
export function UsageStatsSwitch({
  noteOn,
  noteOff = noteOn,
  size = 'footnote',
  testID,
}: UsageStatsSwitchProps) {
  const on = useSettingsStore((s) => s.analyticsEnabled);
  const setOn = useSettingsStore((s) => s.setAnalyticsEnabled);
  const note = on ? noteOn : noteOff;
  const change = (next: boolean) => void setOn(next);

  const lineStyle = size === 'subhead' ? styles.subhead : styles.footnote;
  // The longer of the two lines, which holds the height; null when they are one.
  const reserve = noteOn === noteOff ? null : noteOn.length >= noteOff.length ? noteOn : noteOff;
  const reserveShown = reserve === note;

  return (
    <Pressable
      style={styles.row}
      onPress={() => change(!on)}
      accessibilityRole="switch"
      accessibilityLabel="Usage stats"
      accessibilityHint={note}
      accessibilityState={{ checked: on }}
      // The cross-platform prop as well: react-native-web maps this one.
      aria-checked={on}
      testID={`${testID}-row`}
    >
      <View style={[styles.cell, { marginTop: (SWITCH_HEIGHT - lineStyle.lineHeight) / 2 }]}>
        {reserve === null ? (
          <Text style={lineStyle} testID={`${testID}-note`}>
            {note}
          </Text>
        ) : (
          <>
            <Text
              style={[lineStyle, !reserveShown && styles.invisible]}
              testID={reserveShown ? `${testID}-note` : `${testID}-spacer`}
              aria-hidden={!reserveShown}
              accessibilityElementsHidden={!reserveShown}
              importantForAccessibility={reserveShown ? 'auto' : 'no-hide-descendants'}
            >
              {reserve}
            </Text>
            {!reserveShown && (
              <Text style={[lineStyle, styles.over]} testID={`${testID}-note`}>
                {note}
              </Text>
            )}
          </>
        )}
      </View>
      <ToggleSwitch
        value={on}
        onValueChange={change}
        testID={`${testID}-switch`}
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
  },
  // Its first line centred on the switch (marginTop, from the line's height).
  cell: { flex: 1 },
  footnote: { ...type.footnote, color: colors.textSecondary },
  subhead: { ...type.subhead, color: colors.textSecondary },
  // The longer line while the shorter is said: it keeps its space, unseen.
  invisible: { opacity: 0 },
  // The shorter line, over the top of the longer one's space.
  over: { left: 0, position: 'absolute', right: 0, top: 0 },
  switch: { flexShrink: 0 },
});
