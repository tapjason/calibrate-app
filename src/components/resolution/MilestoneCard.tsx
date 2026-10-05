import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { BRAND_CONFETTI, Confetti } from '@/components/ui/Confetti';
import { haptics } from '@/components/ui/haptics';
import { FLIP_MS, TierFlip } from '@/components/ui/TierFlip';
import { BADGE_META } from '@/constants/badges';
import {
  colors,
  DISPLAY_MAX_SCALE,
  radius,
  space,
  tabularNums,
  type,
} from '@/constants/theme';
import { MIN_N_OVERALL, type Milestone } from '@/types';

/** The words for a milestone. Exported for tests. */
export function milestoneCopy(m: Milestone): { title: string; body: string } {
  switch (m.kind) {
    case 'rating_unlocked':
      return {
        title: 'Your calibration score is unlocked',
        body: `${MIN_N_OVERALL} real resolutions. From here the number means something.`,
      };
    case 'tier_up':
      return {
        title: `${BADGE_META[m.badge].label} in ${m.category}`,
        body: BADGE_META[m.badge].tagline,
      };
    case 'category_unlocked':
      return {
        title: `Your ${m.category} score is unlocked`,
        body: 'Enough resolutions in this category for its score to count.',
      };
  }
}

const EMBLEM_SIZE = 64;

/** Oracle is the one tier whose emblem carries gold, so its confetti may too. */
const ORACLE_CONFETTI: readonly string[] = [...BRAND_CONFETTI, colors.oracleGold];

/**
 * One of the design system's few full celebrations (DESIGN_SYSTEM §6.2):
 * score unlock or badge tier-up. It scales in on a spring and plays the
 * Success haptic — the only place outside the Warmup that pattern is used,
 * and never for a Yes. Reduce Motion gets a plain fade; the haptic still
 * fires, and the words say everything the motion does.
 *
 * A tier-up adds the `tierUp` treatment (§6.1): the emblem flips from the old
 * tier to the new one, the haptic lands as the new face turns in, and a
 * confetti burst leaves the emblem. Under Reduce Motion both are skipped.
 */
export function MilestoneCard({ milestone }: { milestone: Milestone }) {
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(0);
  const tierUp = milestone.kind === 'tier_up';

  useEffect(() => {
    // In sync with the moment (§6.2): on a tier-up, when the new face appears.
    const landing = tierUp && !reduceMotion ? FLIP_MS / 2 : 0;
    const timer = setTimeout(() => haptics.unlock(), landing);
    shown.value = reduceMotion
      ? withTiming(1, { duration: 200 })
      : withSpring(1, { damping: 14, stiffness: 180 });
    return () => clearTimeout(timer);
  }, [reduceMotion, shown, tierUp]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: reduceMotion ? [] : [{ scale: 0.9 + 0.1 * shown.value }],
  }));

  const copy = milestoneCopy(milestone);

  return (
    <Animated.View
      style={[styles.card, style]}
      testID={`milestone-${milestone.kind}`}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${copy.title}. ${copy.body}`}
      accessibilityLiveRegion="polite"
    >
      {milestone.kind === 'tier_up' ? (
        <View style={styles.emblem}>
          <TierFlip from={milestone.from} to={milestone.badge} size={EMBLEM_SIZE} />
          <Confetti
            originX={EMBLEM_SIZE / 2}
            originY={EMBLEM_SIZE / 2}
            palette={milestone.badge === 'oracle' ? ORACLE_CONFETTI : BRAND_CONFETTI}
          />
        </View>
      ) : (
        <Text style={styles.number} maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>
          {milestone.kind === 'rating_unlocked' ? milestone.rating : milestone.score}
        </Text>
      )}
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
    backgroundColor: colors.brand50,
    borderColor: colors.brand200,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.lg,
    marginBottom: space.xxl,
    padding: space.lg,
  },
  // Above the text column, so confetti leaving the emblem isn't drawn under it.
  emblem: { height: EMBLEM_SIZE, width: EMBLEM_SIZE, zIndex: 1 },
  number: {
    ...type.readout,
    ...tabularNums,
    color: colors.textPrimary,
  },
  text: { flex: 1, gap: space.xs },
  title: { ...type.headline, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary },
});
