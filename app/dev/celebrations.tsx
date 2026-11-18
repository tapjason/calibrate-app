import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PracticeReminderOfferCard } from '@/components/practice/PracticeReminderOfferCard';
import { ReminderPromptCard } from '@/components/prediction/ReminderPromptCard';
import { MilestoneCard } from '@/components/resolution/MilestoneCard';
import { StreakCheckpointCard } from '@/components/resolution/StreakCheckpointCard';
import { StreakLine } from '@/components/stats/StreakLine';
import type { CheckpointMoment } from '@/components/stats/checkpointMoment';
import { Button } from '@/components/ui/Button';
import { colors, space, type } from '@/constants/theme';
import type { Milestone, StreakStatus } from '@/types';

const SAMPLES: { label: string; milestone: Milestone }[] = [
  {
    label: 'Tier-up: Guesser → Forecaster',
    milestone: { kind: 'tier_up', category: 'health', badge: 'forecaster', from: 'guesser' },
  },
  {
    label: 'Tier-up: Sharp → Oracle',
    milestone: { kind: 'tier_up', category: 'work', badge: 'oracle', from: 'sharp' },
  },
  { label: 'Score unlock', milestone: { kind: 'rating_unlocked', rating: 78 } },
];

// Nothing done yet today: since D17 one prediction counts, so a day with one
// done can't read "One prediction today makes it 10" (step 95).
const STREAK: StreakStatus = {
  streak: 9,
  today: 0,
  todayCounts: false,
  checkpoint: null,
  nextCheckpoint: 30,
  restDays: 0,
  restUsed: 0,
  restEarnedToday: false,
  nextRestAt: 14,
};

/** Day 3 of a first week, one saved, the morning after one was used, and the day one is saved. */
const REST_SAMPLES: StreakStatus[] = [
  { ...STREAK, streak: 3, nextCheckpoint: 7, nextRestAt: 7 },
  { ...STREAK, restDays: 1 },
  { ...STREAK, restUsed: 1 },
  { ...STREAK, streak: 14, today: 3, todayCounts: true, restDays: 2, restEarnedToday: true, nextRestAt: null },
];

/**
 * The streak row's four states (step 193): today not counted yet (outline
 * flame), counted (filled), a checkpoint day (filled, tinted), and a streak
 * that ended (D60 (e)).
 */
const ROW_SAMPLES: { label: string; status: StreakStatus }[] = [
  { label: 'Not yet today', status: { ...STREAK, streak: 149, nextCheckpoint: 365, restDays: 2, nextRestAt: null } },
  { label: 'Counted', status: { ...STREAK, streak: 150, today: 1, todayCounts: true, nextCheckpoint: 365, restDays: 2, nextRestAt: null } },
  { label: 'Checkpoint day', status: { ...STREAK, streak: 100, today: 1, todayCounts: true, checkpoint: 100, nextCheckpoint: 365, restDays: 2, nextRestAt: null } },
  { label: 'Ended', status: { ...STREAK, streak: 0, ended: { days: 151, on: new Date(Date.now() - 86_400_000).toISOString(), ago: 1 } } },
];

/** The checkpoint's moment (step 194): 7 and 30 with the Rigid tap, 100 and up with Success and confetti. */
const MOMENT_SAMPLES: { days: number; next: number }[] = [
  { days: 7, next: 30 },
  { days: 100, next: 365 },
];

/** A checkpoint day for the row's moment. */
const momentDay = (days: number, next: number): StreakStatus => ({
  ...STREAK,
  streak: days,
  today: 1,
  todayCounts: true,
  checkpoint: days,
  nextCheckpoint: next,
  nextRestAt: null,
});

/**
 * Development only: replays the celebration cards (DESIGN_SYSTEM §6.2) so the
 * motion and haptics can be checked without earning a badge first. Open
 * /dev/celebrations on the web build or a dev client. Release builds redirect
 * home.
 */
export default function DevCelebrationsScreen() {
  const [shown, setShown] = useState(0);
  const [run, setRun] = useState(0);
  // The checkpoint moment to replay, and how many times, so a new key remounts it.
  const [moment, setMoment] = useState<{ days: number; next: number; run: number } | null>(null);
  const [rowMoment, setRowMoment] = useState<CheckpointMoment | null>(null);
  const [rowRun, setRowRun] = useState(0);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>Celebrations</Text>
        <Text style={styles.body}>
          Tap one to play it again. Development builds only.
        </Text>
        {SAMPLES.map((sample, i) => (
          <Button
            key={sample.label}
            label={sample.label}
            variant={i === shown ? 'primary' : 'secondary'}
            onPress={() => {
              setShown(i);
              setRun((r) => r + 1);
            }}
            testID={`dev-celebration-${i}`}
          />
        ))}
        {/* A new key remounts the card, which is what replays its motion. */}
        <MilestoneCard key={run} milestone={SAMPLES[shown].milestone} />

        {/* Native-only cards, previewed here because web never shows them. */}
        <Text style={styles.title}>Other cards</Text>
        <ReminderPromptCard firstDue="Tue, Oct 6" onAllow={() => {}} onDismiss={() => {}} />
        {/* The practice sheet's reminder offer (roadmap step 89), and after a choice. */}
        <PracticeReminderOfferCard onChoose={() => {}} onDismiss={() => {}} />
        <PracticeReminderOfferCard onChoose={() => {}} onDismiss={() => {}} confirmation="Set for 8:00 AM." />

        {/* The streak row's rest-day line in each state (roadmap step 87). */}
        <Text style={styles.title}>Rest days</Text>
        {REST_SAMPLES.map((status, i) => (
          <StreakLine key={i} status={status} testID={`dev-rest-${i}`} />
        ))}

        {/* The streak row in each state (step 193). */}
        <Text style={styles.title}>Streak row</Text>
        {ROW_SAMPLES.map(({ label, status }, i) => (
          <View key={label} testID={`dev-row-${i}`}>
            <Text style={styles.body}>{label}</Text>
            <StreakLine status={status} testID={`dev-row-line-${i}`} />
          </View>
        ))}

        {/* The checkpoint's moment (step 194), on Resolve's card and on
            Today's row. Tap to play; the haptic needs a phone. These play
            every time, without the once-a-day rule. */}
        <Text style={styles.title}>Streak checkpoints</Text>
        {MOMENT_SAMPLES.map(({ days, next }) => (
          <Button
            key={`card-${days}`}
            label={`Card at ${days} days`}
            variant={moment?.days === days ? 'primary' : 'secondary'}
            onPress={() => setMoment((m) => ({ days, next, run: (m?.run ?? 0) + 1 }))}
            testID={`dev-checkpoint-card-${days}`}
          />
        ))}
        {moment && (
          <StreakCheckpointCard
            key={`card-${moment.run}`}
            days={moment.days}
            next={moment.next}
            celebrate
          />
        )}
        {MOMENT_SAMPLES.map(({ days }) => (
          <Button
            key={`row-${days}`}
            label={`Row at ${days} days`}
            variant={rowMoment?.days === days ? 'primary' : 'secondary'}
            onPress={() => {
              setRowMoment({ days, play: true });
              setRowRun((r) => r + 1);
            }}
            testID={`dev-checkpoint-row-${days}`}
          />
        ))}
        {rowMoment && (
          <StreakLine
            key={`row-${rowRun}`}
            status={momentDay(rowMoment.days, rowMoment.days === 7 ? 30 : 365)}
            moment={rowMoment}
            testID="dev-checkpoint-row"
          />
        )}
        {/* And still, as when the same answer unlocked the rating. */}
        <StreakCheckpointCard days={365} next={730} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  wrap: { gap: space.md, padding: space.lg, paddingTop: space.xxl },
  title: { ...type.title2, color: colors.textPrimary },
  body: { ...type.subhead, color: colors.textSecondary },
});
