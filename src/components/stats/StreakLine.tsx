import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { colors, radius, space, type } from '@/constants/theme';
import { useSettingsStore } from '@/store/settingsStore';
import { DAILY_GOAL, type StreakStatus } from '@/types';

import { streakCopy } from './streakCopy';

interface StreakLineProps {
  status: StreakStatus;
  testID?: string;
  /**
   * What the streak is and how to hide it (How scoring works, at Your
   * streak): two streak-wary testers tapped the row first and nothing
   * happened (blind playtest 2026-11-13, runs 4 and 7).
   */
  onPress?: () => void;
}

/**
 * The streak on Home (roadmap D2): a day counts with one prediction logged
 * or answered (D17; it was three), and the number climbs every day it does.
 * One quiet row, the day count in ink with a flame, the day's goal of three
 * as pips, and a line saying what today adds. Never red, never animated when it ends (DESIGN_SYSTEM
 * §6.2): an ended streak simply isn't shown until the next one starts.
 *
 * On a checkpoint day (7, 30, 100, 365…) the row takes the milestone tint and
 * names it for the rest of the day. Static for now: the celebration motion for
 * checkpoints is planned, not built (FUTURE_UI §B).
 *
 * A third, quieter line carries the rest days (roadmap step 87): what's saved,
 * the day one covered, or when the next one comes.
 */
export function StreakLine({ status, testID = 'streak-line', onPress }: StreakLineProps) {
  const copy = streakCopy(status);
  // Off in You (step 173): the row, its goal dots and its rest days go.
  const shown = useSettingsStore((s) => s.streakShown);
  if (!copy || !shown) return null;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        copy.checkpoint && styles.rowCheckpoint,
        pressed && styles.pressed,
      ]}
      accessible
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={copy.spoken}
      accessibilityHint={onPress ? 'Explains the streak, and how to hide it' : undefined}
      testID={testID}
    >
      <Icon sf="flame.fill" fallback="flame" size={18} color={colors.action} />
      <View style={styles.text}>
        <Text style={styles.headline} testID={`${testID}-headline`}>
          {copy.headline}
        </Text>
        {copy.detail && (
          <Text style={styles.detail} testID={`${testID}-detail`}>
            {copy.detail}
          </Text>
        )}
        {copy.rest && (
          <Text style={styles.rest} testID={`${testID}-rest`}>
            {copy.rest}
          </Text>
        )}
      </View>
      {/* The day's goal of three, filled as they're done. Shape, not colour alone:
          filled vs hollow. */}
      <View
        style={styles.pips}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: DAILY_GOAL }, (_, i) => (
          <View
            key={i}
            testID={`${testID}-pip-${i}`}
            style={[styles.pip, i < copy.filled ? styles.pipOn : styles.pipOff]}
          />
        ))}
      </View>
    </Pressable>
  );
}

const PIP = 10;


const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    // Narrow or zoomed, the dots drop below the words instead of squeezing
    // them to a letter a line (playtest 2026-11-03).
    flexWrap: 'wrap',
    gap: space.md,
    marginBottom: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  // The milestone card's tint (MilestoneCard), without its motion.
  rowCheckpoint: { backgroundColor: colors.selectedFill, borderColor: colors.emphasis },
  // Wraps below the flame when there isn't room for about 160, then shrinks
  // to fit the line it has.
  text: { flexBasis: 160, flexGrow: 1, flexShrink: 1 },
  // Not tabular: the count sits in a phrase and doesn't animate in place, and
  // tabular figures space a phrase's digits apart (Inter's widened the
  // hyphen too, "15 - day").
  headline: { ...type.headline, color: colors.textPrimary },
  detail: { ...type.footnote, color: colors.textSecondary },
  // Quieter than the detail, still 4.6:1 or better on surface (§2.2).
  rest: { ...type.caption, color: colors.textTertiary, marginTop: space.xxs },
  pips: { flexDirection: 'row', gap: space.xs },
  pip: { borderRadius: PIP / 2, height: PIP, width: PIP },
  pipOn: { backgroundColor: colors.action },
  pipOff: { borderColor: colors.controlBorder, borderWidth: 1.5 },
});
