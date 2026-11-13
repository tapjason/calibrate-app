import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '@/constants/theme';
import { usePracticeStore } from '@/store/practiceStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';

import { isReadyToResolve } from './dueGroups';
import { welcomeBackLines } from './welcomeBackCopy';

/**
 * Today's card for someone back after two weeks or more with nothing logged
 * or answered (roadmap D51): how long, what's waiting, the streak, and that
 * the rating moves as they catch up. A tester back after two months was told
 * nothing, and read a silent drop in the rating and a missing streak as
 * something taken away (blind playtest 2026-11-09b, finding 4). Shown all day
 * on the return, until "Got it".
 */
export function WelcomeBackCard() {
  const pending = usePredictionStore((s) => s.pending);
  // Subscribed so the card follows each answer.
  usePredictionStore((s) => s.resolved.length);
  const dismissedFor = useSettingsStore((s) => s.welcomeBackDismissedFor);
  const streakShown = useSettingsStore((s) => s.streakShown);
  const rated = useStatsStore((s) => s.userStat !== null && !s.userStat.rating_is_provisional);
  // Practising counts as being here (review, 2026-11-09).
  const practice = usePracticeStore((s) => s.answers);
  const now = new Date();
  const store = usePredictionStore.getState();
  const gap = store.returnNow(
    now,
    practice.map((a) => a.day),
  );
  // Dismissed for this return or a later one. By time, not by string: a
  // deleted row or a pulled timestamp in another format moved the key and
  // brought the card back (review, 2026-11-09).
  if (!gap || (dismissedFor !== null && Date.parse(dismissedFor) >= Date.parse(gap.lastActiveAt))) {
    return null;
  }

  const lines = welcomeBackLines({
    // No word of the streak when it's switched off in You (step 173).
    gap: streakShown ? gap : { ...gap, endedStreak: 0 },
    ready: pending.filter((p) => isReadyToResolve(p, now)).length,
    todayCounts: store.streakNow(now).todayCounts,
    rated,
    activeToday: store.streakNow(now).today > 0,
  });

  return (
    <View style={styles.wrap} testID="welcome-back">
      <Text style={styles.title} accessibilityRole="header">
        Welcome back
      </Text>
      {lines.map((line) => (
        <Text key={line} style={styles.body}>
          {line}
        </Text>
      ))}
      <Pressable
        onPress={() => void useSettingsStore.getState().dismissWelcomeBack(gap.lastActiveAt)}
        accessibilityRole="button"
        hitSlop={8}
        style={styles.done}
        testID="welcome-back-dismiss"
      >
        <Text style={styles.doneText}>Got it</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // The backup card's shape: a sunken panel, no hue (roadmap D33).
  wrap: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    gap: space.sm,
    marginBottom: space.lg,
    padding: space.lg,
  },
  title: { ...type.headline, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary },
  done: { alignSelf: 'flex-start', paddingVertical: space.sm },
  doneText: { ...type.subhead, color: colors.actionText, fontWeight: '600' },
});
