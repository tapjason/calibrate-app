import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { colors, radius, space, tabularNums, type } from '@/constants/theme';
import { STREAK_DAY_MIN, type StreakStatus } from '@/types';

import { streakCopy } from './streakCopy';

interface StreakLineProps {
  status: StreakStatus;
  testID?: string;
}

/**
 * The streak on Home (roadmap D2): a day counts with three predictions logged
 * or answered, and the number climbs every day it does. One quiet row, the
 * day count in ink with a flame, today's progress as three pips and a line
 * saying what today adds. Never red, never animated when it ends (DESIGN_SYSTEM
 * §6.2): an ended streak simply isn't shown until the next one starts.
 *
 * On a checkpoint day (7, 30, 100, 365…) the row takes the milestone tint and
 * names it for the rest of the day. Static for now: the celebration motion for
 * checkpoints is planned, not built (FUTURE_UI §B).
 */
export function StreakLine({ status, testID = 'streak-line' }: StreakLineProps) {
  const copy = streakCopy(status);
  if (!copy) return null;

  return (
    <View
      style={[styles.row, copy.checkpoint && styles.rowCheckpoint]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={copy.spoken}
      testID={testID}
    >
      <Icon sf="flame.fill" fallback="flame" size={18} color={colors.brand600} />
      <View style={styles.text}>
        <Text style={styles.headline} testID={`${testID}-headline`}>
          {copy.headline}
        </Text>
        {copy.detail && (
          <Text style={styles.detail} testID={`${testID}-detail`}>
            {copy.detail}
          </Text>
        )}
      </View>
      {/* Today's three, filled as they're done. Shape, not colour alone:
          filled vs hollow. */}
      <View
        style={styles.pips}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: STREAK_DAY_MIN }, (_, i) => (
          <View
            key={i}
            testID={`${testID}-pip-${i}`}
            style={[styles.pip, i < copy.filled ? styles.pipOn : styles.pipOff]}
          />
        ))}
      </View>
    </View>
  );
}

const PIP = 10;

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.md,
    marginBottom: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  // The milestone card's tint (MilestoneCard), without its motion.
  rowCheckpoint: { backgroundColor: colors.brand50, borderColor: colors.brand200 },
  text: { flex: 1 },
  headline: { ...type.headline, ...tabularNums, color: colors.textPrimary },
  detail: { ...type.footnote, color: colors.textSecondary },
  pips: { flexDirection: 'row', gap: space.xs },
  pip: { borderRadius: PIP / 2, height: PIP, width: PIP },
  pipOn: { backgroundColor: colors.brand600 },
  pipOff: { borderColor: colors.controlBorder, borderWidth: 1.5 },
});
