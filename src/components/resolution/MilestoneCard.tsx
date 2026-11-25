import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { BRAND_CONFETTI, Confetti } from '@/components/ui/Confetti';
import { haptics } from '@/components/ui/haptics';
import { FLIP_MS, TierFlip } from '@/components/ui/TierFlip';
import { useSpringIn } from '@/components/ui/useSpringIn';
import { BADGE_META } from '@/constants/badges';
import {
  colors,
  DISPLAY_MAX_SCALE,
  radius,
  space,
  tabularNums,
  type,
} from '@/constants/theme';
import { MIN_N_CATEGORY, MIN_N_OVERALL, type BadgeLevel, type Milestone } from '@/types';
import { categoryLabel } from '@/store/categoryStore';

/** The words for a milestone. Exported for tests. */
export function milestoneCopy(m: Milestone): { title: string; body: string } {
  switch (m.kind) {
    case 'rating_unlocked': {
      // Not "means something" (D62): at 20 it's give or take several
      // points, and perfect calibration itself scores about 85–88. "Rough
      // for now" says it in the owner's words (D76, the voice pass,
      // 2026-11-23); the give-or-take is in How scoring works.
      const unlocked = `${MIN_N_OVERALL} scored answers in. Here’s your rating. It’s rough for now and settles as you answer more.`;
      return {
        title: 'Your calibration score is unlocked',
        // With the badge this answer also earned: only one card shows, and
        // the unlock's won, so the badge was said nowhere (blind playtest
        // 2026-11-13e, run 3). A Bronze is named and nothing more (review
        // round 3, 2026-11-25): its own line says "20 scored answers" again,
        // beside the unlock's "20 scored answers in".
        body: m.badge
          ? `${unlocked} New badge, too: ${BADGE_META[m.badge.badge].label} in ${categoryLabel(m.badge.category)}.${m.badge.badge === 'tracker' ? '' : ` ${BADGE_FOLLOWS}`}`
          : unlocked,
      };
    }
    case 'tier_up':
      return {
        // Said as new (D62): a big tile right after "No, I didn't sleep"
        // read as a mistake (blind playtest 2026-11-13d, run 3).
        title: `New badge: ${BADGE_META[m.badge].label} in ${categoryLabel(m.category)}`,
        body: BADGE_META[m.badge].tagline,
      };
  }
}

/**
 * Under a badge earned (D62): one earned on a miss read as an error (blind
 * playtest 2026-11-13d, run 3). The same after Yes and No, which get
 * identical feedback (CLAUDE.md), so it doesn't name the No.
 */
export const BADGE_FOLLOWS =
  'Badges follow how well your numbers match what happens, not how often you’re right.';

/**
 * Under a new Bronze instead (record audit 2026-11-25): Bronze comes with the
 * count alone, so "badges follow how well your numbers match" wasn't true of
 * the one just earned.
 */
export const BRONZE_FOLLOWS = `${BADGE_META.tracker.label} comes with ${MIN_N_CATEGORY} scored answers. ${BADGE_META.forecaster.label} and up follow how well your numbers match what happens.`;

/** The sentence under a badge earned: Bronze's own, every other tier's the same. */
export function badgeFollows(badge: BadgeLevel): string {
  return badge === 'tracker' ? BRONZE_FOLLOWS : BADGE_FOLLOWS;
}

const EMBLEM_SIZE = 64;

/** Gold and Platinum are the tiers whose emblems carry gold (D80), so their confetti may too. */
const GOLD_CONFETTI: readonly string[] = [...BRAND_CONFETTI, colors.medalGold];
const GOLD_TIERS: ReadonlySet<string> = new Set(['sharp', 'oracle']);

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
  const tierUp = milestone.kind === 'tier_up';
  // The spring every full moment shares (a streak checkpoint's too, step 194).
  const style = useSpringIn('play');

  useEffect(() => {
    // In sync with the moment (§6.2): on a tier-up, when the new face appears.
    const landing = tierUp && !reduceMotion ? FLIP_MS / 2 : 0;
    const timer = setTimeout(() => haptics.unlock(), landing);
    return () => clearTimeout(timer);
  }, [reduceMotion, tierUp]);

  const base = milestoneCopy(milestone);
  const copy =
    milestone.kind === 'tier_up'
      ? {
          ...base,
          // A new Bronze's own line carries the count, so the tagline would say it twice.
          body:
            milestone.badge === 'tracker'
              ? BRONZE_FOLLOWS
              : `${base.body}. ${badgeFollows(milestone.badge)}`,
        }
      : base;

  return (
    <Animated.View
      style={[styles.card, style]}
      testID={`milestone-${milestone.kind}`}
      accessible
      accessibilityRole="summary"
      // The unlock's rating is drawn as a figure, not written in the title:
      // VoiceOver heard the card without its number (record audit, round 2).
      accessibilityLabel={
        milestone.kind === 'rating_unlocked'
          ? `${copy.title}: ${milestone.rating} out of 100. ${copy.body}`
          : `${copy.title}. ${copy.body}`
      }
      accessibilityLiveRegion="polite"
    >
      {milestone.kind === 'tier_up' ? (
        <View style={styles.emblem}>
          <TierFlip from={milestone.from} to={milestone.badge} size={EMBLEM_SIZE} />
          <Confetti
            originX={EMBLEM_SIZE / 2}
            originY={EMBLEM_SIZE / 2}
            palette={GOLD_TIERS.has(milestone.badge) ? GOLD_CONFETTI : BRAND_CONFETTI}
          />
        </View>
      ) : (
        <Text style={styles.number} maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>
          {milestone.rating}
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
    backgroundColor: colors.selectedFill,
    borderColor: colors.emphasis,
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
