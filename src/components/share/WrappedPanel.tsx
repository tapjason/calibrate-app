import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { dueWithin } from '@/components/prediction/dueGroups';
import { haptics } from '@/components/ui/haptics';
import { colors, space, type } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { track } from '@/analytics/track';
import { resolveTheme, WRAPPED_DEFAULT_THEME } from '@/constants/cardThemes';
import { shareCard, type ShareOutcome } from '@/share/export';
import { useEntitlementStore } from '@/store/entitlementStore';
import { useSettingsStore } from '@/store/settingsStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore, wrappedSummary, type WrappedSpan } from '@/store/statsStore';

import { nextBadgeProgress } from './nextBadgeCopy';
import { WrappedCard } from './WrappedCard';

interface WrappedPanelProps {
  span: WrappedSpan;
}

const MESSAGES: Record<Exclude<ShareOutcome, 'shared'>, string> = {
  unavailable: "Sharing isn't available on this device — screenshot it instead.",
  failed: "Couldn't build the image. Try again?",
};

/**
 * Days whose weekly recap was already revealed this session. The week is a
 * rolling seven days, so it is a new recap each day, not each calendar week.
 */
const revealedWeeks = new Set<string>();

/** Test hook: forget which weeks have been revealed. */
export function __resetRevealedWeeksForTests(): void {
  revealedWeeks.clear();
}

const REVEAL_MS = 400;

/**
 * The weekly `reveal` (DESIGN_SYSTEM §6.1–6.2: no confetti). The *panel*
 * around the card moves, never the card: the card is what gets captured to
 * PNG, and an animation inside it could be caught mid-frame. It plays once
 * a day per session — a recap you've already seen shouldn't re-perform every
 * time you open Share — and only when the week has something in it.
 * Reduce Motion gets the 200 ms cross-fade; the haptic still fires.
 */
function useWeeklyReveal(dayKey: string, enabled: boolean) {
  const reduceMotion = useReducedMotion();
  const [play] = useState(() => enabled && !revealedWeeks.has(dayKey));
  const shown = useSharedValue(play ? 0 : 1);

  useEffect(() => {
    if (!play) return;
    revealedWeeks.add(dayKey);
    const duration = reduceMotion ? 200 : REVEAL_MS;
    shown.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
    const landed = setTimeout(() => haptics.reveal(), duration);
    return () => clearTimeout(landed);
  }, [play, reduceMotion, shown, dayKey]);

  return useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: reduceMotion ? [] : [{ translateY: 16 * (1 - shown.value) }],
  }));
}

/**
 * Calibration Wrapped for one window, with its share button.
 *
 * The recap is derived on render from the resolved list rather than stored:
 * it is a pure function of predictions the store already holds, and caching it
 * would only create a second thing to invalidate every time a resolution
 * lands.
 */
export function WrappedPanel({ span }: WrappedPanelProps) {
  const resolved = usePredictionStore((s) => s.resolved);
  const pending = usePredictionStore((s) => s.pending);
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const cardThemeId = useSettingsStore((s) => s.cardThemeId);
  const userStat = useStatsStore((s) => s.userStat);
  const categoryStats = useStatsStore((s) => s.categoryStats);
  const nextBadges = useStatsStore((s) => s.nextBadges);
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Off by default: titles only reach a card someone chose to put them on.
  const [showTitles, setShowTitles] = useState(false);

  // `now` is frozen per render pass of this list so the window doesn't shift
  // underneath a capture that's already in flight.
  const summary = useMemo(
    () => wrappedSummary(resolved, span, new Date()),
    [resolved, span],
  );
  const hasTitles = summary.boldest_hit !== null || summary.biggest_miss !== null;
  const revealStyle = useWeeklyReveal(
    new Date(summary.end).toDateString(),
    span === 'week' && summary.resolved > 0,
  );

  // Wrapped's own free look is indigo, so an unthemed card keeps it; a chosen
  // Plus theme applies to both cards, which is what makes it feel like a look
  // rather than a per-screen setting.
  const chosen = resolveTheme(cardThemeId, isPlus);
  const theme = chosen.plus ? chosen : WRAPPED_DEFAULT_THEME;

  const onShare = async () => {
    setSharing(true);
    setMessage(null);
    try {
      const outcome = await shareCard(cardRef);
      setMessage(outcome === 'shared' ? null : MESSAGES[outcome]);
      if (outcome === 'shared') {
        void track('share_completed', {
          surface: span === 'week' ? 'weekly' : 'yearly',
        });
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.wrap} testID={`wrapped-panel-${span}`}>
      <Animated.View style={revealStyle} testID="wrapped-reveal">
        <WrappedCard
          ref={cardRef}
          summary={summary}
          overall={
            userStat
              ? {
                  resolved: userStat.total_resolved,
                  provisional: userStat.rating_is_provisional,
                }
              : null
          }
          upcoming={span === 'week' ? dueWithin(pending, new Date(), 7) : 0}
        badge={nextBadgeProgress(categoryStats, nextBadges)}
          theme={theme}
          showTitles={showTitles}
        />
      </Animated.View>

      {hasTitles && (
        <Pressable
          style={styles.toggleRow}
          onPress={() => setShowTitles((v) => !v)}
          accessibilityRole="switch"
          accessibilityState={{ checked: showTitles }}
          accessibilityLabel="Show prediction titles on the card"
          testID="wrapped-titles-toggle"
        >
          <Text style={styles.toggleLabel}>Show prediction titles on the card</Text>
          <Switch
            value={showTitles}
            onValueChange={setShowTitles}
            trackColor={{ true: colors.brand600, false: colors.controlBorder }}
            thumbColor={colors.surface}
            ios_backgroundColor={colors.controlBorder}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            {...{ activeThumbColor: colors.surface }}
          />
        </Pressable>
      )}

      <Button
        label={sharing ? 'Preparing…' : 'Share my recap'}
        testID="wrapped-share-button"
        disabled={sharing || summary.resolved === 0}
        onPress={onShare}
      />

      {message && (
        <Text style={styles.message} testID="wrapped-share-message">
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  message: { ...type.footnote, color: colors.textSecondary, textAlign: 'center' },
  toggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.md,
    justifyContent: 'space-between',
    minHeight: 44,
  },
  toggleLabel: { ...type.subhead, color: colors.textPrimary, flex: 1 },
});
