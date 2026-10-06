import { useRouter } from 'expo-router';
import { SectionList, StyleSheet, Text, View } from 'react-native';

import { groupByDue, nextDueLine } from '@/components/prediction/dueGroups';
import { PredictionCard } from '@/components/prediction/PredictionCard';
import { ReminderPrompt } from '@/components/prediction/ReminderPrompt';
import { RUN_THRESHOLD } from '@/components/resolution/ResolveRun';
import { chartTakeaway } from '@/components/stats/chartTakeaway';
import { IdentityLine } from '@/components/stats/IdentityLine';
import { ratingHeadline } from '@/components/stats/ratingHeadline';
import { ScoreBar } from '@/components/stats/ScoreBar';
import { StreakLine } from '@/components/stats/StreakLine';
import { UnlockProgress } from '@/components/stats/UnlockProgress';
import { Button } from '@/components/ui/Button';
import { CountUp } from '@/components/ui/CountUp';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, space, tabularNums, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';
import { MIN_N_OVERALL } from '@/types';

export default function HomeScreen() {
  const router = useRouter();
  const pending = usePredictionStore((s) => s.pending);
  // Subscribed so the streak line follows each answer as well as each log.
  usePredictionStore((s) => s.resolved);
  const streak = usePredictionStore.getState().streakNow();
  const userStat = useStatsStore((s) => s.userStat);
  const categoryStats = useStatsStore((s) => s.categoryStats);
  const buckets = useStatsStore((s) => s.calibration.buckets);
  const headline = ratingHeadline(userStat);
  const groups = groupByDue(pending, new Date());

  const hero =
    headline && !headline.provisional ? (
      <View style={styles.rated}>
        {/* Number and label as one stop for a screen reader (roadmap step 43). */}
        <View
          style={styles.rated}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Calibration rating, ${headline.rating} out of 100.`}
          testID="home-rating-group"
        >
          <CountUp value={headline.rating} style={styles.ratingNumber} testID="home-rating" />
          <Text style={styles.ratingLabel}>calibration rating</Text>
        </View>
        <ScoreBar score={headline.rating} testID="home-score-bar" />
        {/* Identity, not statistics (CLAUDE.md): the share card's headline,
            here too, once a category has climbed past Guesser. */}
        <IdentityLine
          userStat={userStat}
          categoryStats={categoryStats}
          onPress={() => router.push('/share' as never)}
        />
        {/* The one-line read, only when a band has enough to say it
            (chartTakeaway's own min-N); otherwise the number stands alone. */}
        {(() => {
          const t = chartTakeaway(buckets, false);
          return t.title.startsWith("You're") ? (
            <Text style={styles.takeaway} testID="home-takeaway">
              {t.title}
            </Text>
          ) : null;
        })()}
      </View>
    ) : (
      // Never a countdown in the hero slot (DESIGN_SYSTEM §0 rule 2).
      <UnlockProgress
        testID="home-unlock-progress"
        resolved={userStat?.total_resolved ?? 0}
        pending={pending.length}
        total={MIN_N_OVERALL}
        nextDue={nextDueLine(pending, new Date())}
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
          {/* The daily streak (roadmap D2): three logged or answered a day. */}
          <StreakLine status={streak} />
          {/* Asks for notification permission here, in context, not at
              launch (roadmap step 38). Native only. */}
          <ReminderPrompt />
        </>
      }
      renderSectionHeader={({ section }) => (
        <>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {section.title} · {section.data.length}
          </Text>
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
      renderItem={({ item }) => (
        <PredictionCard
          prediction={item}
          onPress={(id) => router.push(`/resolve/${id}` as never)}
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
  content: { padding: space.lg },
  hero: { marginBottom: space.xxl },
  rated: { alignItems: 'center' },
  // The hero numeral is always ink (DESIGN_SYSTEM §2.4).
  ratingNumber: { ...type.display, ...tabularNums, color: colors.textPrimary },
  ratingLabel: { ...type.subhead, color: colors.textSecondary },
  takeaway: { ...type.callout, color: colors.textPrimary, marginTop: space.sm },
  run: { marginBottom: space.md },
  sectionTitle: {
    ...type.eyebrow,
    color: colors.textSecondary,
    marginBottom: space.sm,
    marginTop: space.md,
  },
});
