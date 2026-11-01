import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';

import { PracticeCard } from '@/components/practice/PracticeCard';
import {
  firstAnswerLead,
  groupByDue,
  isReadyToResolve,
  nextDueLine,
} from '@/components/prediction/dueGroups';
import { PredictionCard, rowPosition } from '@/components/prediction/PredictionCard';
import { ReminderPrompt } from '@/components/prediction/ReminderPrompt';
import { RUN_THRESHOLD } from '@/components/resolution/ResolveRun';
import { BackupNudge } from '@/components/settings/BackupNudge';
import { chartTakeaway } from '@/components/stats/chartTakeaway';
import { IdentityLine } from '@/components/stats/IdentityLine';
import { ratingHeadline } from '@/components/stats/ratingHeadline';
import { ScoreBar } from '@/components/stats/ScoreBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StreakLine } from '@/components/stats/StreakLine';
import { UnlockProgress } from '@/components/stats/UnlockProgress';
import { Button } from '@/components/ui/Button';
import { CountUp } from '@/components/ui/CountUp';
import { EmptyState } from '@/components/ui/EmptyState';
import { holdRanges } from '@/components/ui/holdRanges';
import { useLocalDay } from '@/components/ui/useLocalDay';
import { colors, space, tabularNums, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';
import { useRatingStore } from '@/store/ratingStore';
import { useStatsStore } from '@/store/statsStore';
import { MIN_N_OVERALL } from '@/types';

/** Warm for over, cool for under, green on the line: the takeaway's own hue. */
function directionMark(title: string): string {
  if (title.includes('overconfident')) return colors.overMark;
  if (title.includes('underconfident')) return colors.underMark;
  return colors.calibratedMark;
}

export default function TodayScreen() {
  const router = useRouter();
  // The groups, the streak row and the dates below read the clock: re-render
  // when the day turns, not only when a store changes.
  useLocalDay();
  // Back on Today after a Resolve sheet: the one place a rating ask may come,
  // if a finished run or the score's unlock earned one (roadmap D15).
  useFocusEffect(
    useCallback(() => {
      void useRatingStore.getState().askIfDue();
    }, []),
  );
  const pending = usePredictionStore((s) => s.pending);
  // Subscribed so the streak line follows each answer as well as each log.
  const resolvedCount = usePredictionStore((s) => s.resolved.length);
  const streak = usePredictionStore.getState().streakNow();
  const userStat = useStatsStore((s) => s.userStat);
  const categoryStats = useStatsStore((s) => s.categoryStats);
  const buckets = useStatsStore((s) => s.calibration.buckets);
  const headline = ratingHeadline(userStat);
  const groups = groupByDue(pending, new Date());
  // What's ready to answer comes before the streak and practice rows (D22,
  // 2026-10-09): it's the one thing on Today that asks for a tap, and below
  // them it sat about a screen down.
  const hasReady = groups.some((g) => g.key === 'ready');
  const daily = (
    <>
      {/* The daily streak (roadmap D2): one logged or answered a day keeps
          it, three is the day's goal (D17). */}
      <StreakLine status={streak} />
      {/* Asks for notification permission here, in context, not at
          launch (roadmap step 38). Native only. */}
      <ReminderPrompt />
      {/* After 30 days on one phone without an account (roadmap D31). */}
      <BackupNudge onSignIn={() => router.push('/account' as never)} />
      {/* A reason to open the app on a day nothing comes due (roadmap
          step 88). Not before the first prediction: on Day 0 the Warmup
          has just asked ten questions, and the next thing is the first
          real one. */}
      {pending.length + resolvedCount > 0 && (
        <PracticeCard onOpen={() => router.push('/practice' as never)} />
      )}
    </>
  );

  // The one-line read, only when a band has enough to say it (chartTakeaway's
  // own min-N); otherwise the number stands alone.
  const read = headline && !headline.provisional ? chartTakeaway(buckets, false) : null;
  const hero =
    headline && !headline.provisional ? (
      <View style={styles.rated}>
        {/* Identity leads and the number is its receipt (DESIGN_SYSTEM §1,
            §7.1; roadmap D33): the share card's headline, once a category
            has climbed past Guesser. */}
        <IdentityLine
          userStat={userStat}
          categoryStats={categoryStats}
          // What the tiers mean, not the share card (roadmap D27).
          onPress={() => router.push('/scoring?section=badges' as never)}
        />
        <ScoreBar score={headline.rating} testID="home-score-bar" />
        {/* Number and label as one stop for a screen reader (roadmap step 43). */}
        <View
          style={styles.receipt}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Calibration rating, ${headline.rating} out of 100.`}
          testID="home-rating-group"
        >
          <CountUp value={headline.rating} style={styles.ratingNumber} testID="home-rating" />
          <Text style={styles.ratingLabel}>calibration rating</Text>
        </View>
        {read?.title.startsWith("You're") && (
          <View style={styles.takeawayRow}>
            {/* The direction's own hue, beside the words that carry it (rule 0.5). */}
            <View
              style={[styles.takeawayDot, { backgroundColor: directionMark(read.title) }]}
            />
            <Text style={styles.takeaway} testID="home-takeaway">
              {holdRanges(read.title)}
            </Text>
          </View>
        )}
      </View>
    ) : (
      // Never a countdown in the hero slot (DESIGN_SYSTEM §0 rule 2).
      <UnlockProgress
        testID="home-unlock-progress"
        resolved={userStat?.total_resolved ?? 0}
        pending={pending.length}
        total={MIN_N_OVERALL}
        // Before the first answer, the lead names its evening (roadmap D30), and
        // the caption doesn't repeat the date.
        lead={(userStat?.total_resolved ?? 0) === 0 ? firstAnswerLead(pending, new Date()) : null}
        nextDue={
          (userStat?.total_resolved ?? 0) === 0 ? null : nextDueLine(pending, new Date())
        }
      />
    );

  return (
    <SectionList
      style={styles.screen}
      contentContainerStyle={styles.content}
      sections={groups}
      keyExtractor={(p) => p.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <>
          <View style={styles.hero}>{hero}</View>
          {!hasReady && daily}
        </>
      }
      renderSectionFooter={({ section }) =>
        section.key === 'ready' ? (
          <View style={styles.dailyAfterReady} testID="home-daily-after-ready">
            {daily}
          </View>
        ) : null
      }
      renderSectionHeader={({ section }) => (
        <>
          <SectionHeader title={section.title} count={section.data.length} />
          {/* A backlog is where people quit: past a few, answer them in one
              sitting (roadmap step 18). */}
          {section.key === 'ready' && section.data.length >= RUN_THRESHOLD && (
            <View style={styles.run}>
              <Button
                label={`Resolve all ${section.data.length}`}
                testID="home-resolve-all"
                onPress={() => router.push('/resolve/run' as never)}
              />
            </View>
          )}
        </>
      )}
      renderItem={({ item, index, section }) => (
        <PredictionCard
          prediction={item}
          position={rowPosition(index, section.data.length)}
          // The header already says it (roadmap D33).
          showReady={section.key !== 'ready'}
          // A due one opens Resolve; one that isn't due yet opens its details,
          // where it can be edited, deleted or answered early (roadmap D25).
          onPress={(id) =>
            router.push(
              (isReadyToResolve(item, new Date()) ? `/resolve/${id}` : `/prediction/${id}`) as never,
            )
          }
        />
      )}
      ListEmptyComponent={
        <EmptyState
          testID="home-empty"
          symbol={{ sf: 'calendar.badge.plus', fallback: 'calendar-outline' }}
          message="Nothing open. What do you think will happen this week?"
          actionLabel="Log a prediction"
          onAction={() => router.push('/log' as never)}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas },
  content: { padding: space.lg, paddingBottom: space.xxl },
  // The daily rows after the ready ones (D22): spaced like a section.
  dailyAfterReady: { marginTop: space.lg },
  hero: { marginBottom: space.xxxl, marginTop: space.sm },
  // Left-aligned, like everything below it (roadmap D33).
  rated: { alignItems: 'stretch' },
  receipt: { alignItems: 'baseline', flexDirection: 'row', gap: space.md, marginTop: space.md },
  // The hero numeral is always ink (DESIGN_SYSTEM §2.4).
  ratingNumber: { ...type.readout, ...tabularNums, color: colors.textPrimary },
  ratingLabel: { ...type.subhead, color: colors.textSecondary, flexShrink: 1 },
  takeawayRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm, marginTop: space.md },
  takeawayDot: { borderRadius: 5, height: 10, width: 10 },
  takeaway: { ...type.callout, color: colors.textPrimary, flexShrink: 1 },
  run: { marginBottom: space.md },
});
