import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PracticeReminderOfferCard } from '@/components/practice/PracticeReminderOfferCard';
import { ReminderPromptCard } from '@/components/prediction/ReminderPromptCard';
import { MilestoneCard } from '@/components/resolution/MilestoneCard';
import { StreakCheckpointCard } from '@/components/resolution/StreakCheckpointCard';
import { StreakLine } from '@/components/stats/StreakLine';
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
  {
    label: 'Category unlock',
    milestone: { kind: 'category_unlocked', category: 'finance', score: 64 },
  },
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
 * Development only: replays the celebration cards (DESIGN_SYSTEM §6.2) so the
 * motion and haptics can be checked without earning a badge first. Open
 * /dev/celebrations on the web build or a dev client. Release builds redirect
 * home.
 */
export default function DevCelebrationsScreen() {
  const [shown, setShown] = useState(0);
  const [run, setRun] = useState(0);

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

        {/* Static on purpose: the checkpoint celebration isn't built yet
            (FUTURE_UI §B). */}
        <Text style={styles.title}>Streak checkpoints</Text>
        <StreakCheckpointCard days={7} next={30} />
        <StreakCheckpointCard days={100} next={365} />
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
