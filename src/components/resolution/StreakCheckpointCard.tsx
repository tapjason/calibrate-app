import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useCheckpointMoment } from '@/components/stats/checkpointMoment';
import { checkpointCopy } from '@/components/stats/streakCopy';
import { Confetti } from '@/components/ui/Confetti';
import { CountUp } from '@/components/ui/CountUp';
import { localCount } from '@/components/ui/count';
import { Icon } from '@/components/ui/Icon';
import { colors, DISPLAY_MAX_SCALE, radius, space, tabularNums, type } from '@/constants/theme';

interface StreakCheckpointCardProps {
  /** The checkpoint this answer reached: 7, 30, 100, 365, then each further year. */
  days: number;
  /** The one after it. */
  next: number;
  /**
   * Play the checkpoint's moment (step 194): Resolve decides, once, when the
   * answer lands (`claimStreakMoment`). Left out, the card is still: when the
   * same answer unlocked the rating or earned a badge, that moment plays
   * instead, one full moment per answer.
   */
  celebrate?: boolean;
}

const FLAME = 22;

/**
 * The answer that made today count also reached a streak checkpoint (decided
 * 2026-10-06). Shown where the answer was given, in the milestone card's
 * tint. With `celebrate`, it plays the checkpoint's moment (step 194, D67;
 * `checkpointMoment.ts`): the milestone spring, the count rolling up from the
 * day before, the flame's bounce, Rigid at 7 and 30 or Success from 100, and
 * confetti from the flame at 100 and up. Without, it's as it was: still.
 */
export function StreakCheckpointCard({ days, next, celebrate = false }: StreakCheckpointCardProps) {
  const copy = checkpointCopy(days, next);
  const moment = useCheckpointMoment(days, celebrate ? 'play' : 'still');
  return (
    <Animated.View
      style={[styles.card, moment.whole]}
      testID="streak-checkpoint"
      accessible
      accessibilityRole="summary"
      accessibilityLabel={copy.spoken}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.figure}>
        {/* Above the number, so confetti leaving the flame isn't drawn under it. */}
        <View style={styles.flame}>
          <Animated.View style={moment.flame}>
            <Icon
              sf="flame.fill"
              fallback="flame"
              size={FLAME}
              color={colors.action}
              testID="streak-checkpoint-flame"
            />
          </Animated.View>
          {moment.confetti && (
            <Confetti originX={FLAME / 2} originY={FLAME / 2} testID="streak-checkpoint-confetti" />
          )}
        </View>
        {moment.playing ? (
          <CountUp
            value={days}
            from={days - 1}
            format={localCount}
            style={styles.number}
            testID="streak-checkpoint-count"
          />
        ) : (
          <Text
            style={styles.number}
            maxFontSizeMultiplier={DISPLAY_MAX_SCALE}
            testID="streak-checkpoint-count"
          >
            {localCount(days)}
          </Text>
        )}
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.selectedFill,
    borderColor: colors.emphasis,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.lg,
    marginBottom: space.xxl,
    padding: space.lg,
  },
  // Above the text column, so the confetti is drawn over it.
  figure: { alignItems: 'center', flexDirection: 'row', gap: space.xs, zIndex: 1 },
  flame: { zIndex: 1 },
  number: { ...type.readout, ...tabularNums, color: colors.textPrimary },
  text: { flex: 1, gap: space.xs },
  title: { ...type.headline, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary },
});
