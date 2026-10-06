import { StyleSheet, Text, View } from 'react-native';

import { checkpointCopy } from '@/components/stats/streakCopy';
import { Icon } from '@/components/ui/Icon';
import { colors, DISPLAY_MAX_SCALE, radius, space, tabularNums, type } from '@/constants/theme';

interface StreakCheckpointCardProps {
  /** The checkpoint this answer reached: 7, 30, 100, 365, then each further year. */
  days: number;
  /** The one after it. */
  next: number;
}

/**
 * The answer that made today count also reached a streak checkpoint (decided
 * 2026-10-06). Shown where the answer was given, in the milestone card's tint,
 * and deliberately still: no spring, no confetti, no Success haptic. The
 * celebration for checkpoints is planned but not built (FUTURE_UI §B), and
 * DESIGN_SYSTEM §6.2 keeps the Success haptic for unlocks and tier-ups.
 */
export function StreakCheckpointCard({ days, next }: StreakCheckpointCardProps) {
  const copy = checkpointCopy(days, next);
  return (
    <View
      style={styles.card}
      testID="streak-checkpoint"
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${copy.title}. ${copy.body}`}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.figure}>
        <Icon sf="flame.fill" fallback="flame" size={22} color={colors.brand600} />
        <Text style={styles.number} maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>
          {days}
        </Text>
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.brand50,
    borderColor: colors.brand200,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.lg,
    marginBottom: space.xxl,
    padding: space.lg,
  },
  figure: { alignItems: 'center', flexDirection: 'row', gap: space.xs },
  number: { ...type.readout, ...tabularNums, color: colors.textPrimary },
  text: { flex: 1, gap: space.xs },
  title: { ...type.headline, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary },
});
