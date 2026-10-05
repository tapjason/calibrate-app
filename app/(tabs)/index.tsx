import { useRouter } from 'expo-router';
import { SectionList, StyleSheet, Text, View } from 'react-native';

import { groupByDue } from '@/components/prediction/dueGroups';
import { PredictionCard } from '@/components/prediction/PredictionCard';
import { RUN_THRESHOLD } from '@/components/resolution/ResolveRun';
import { chartTakeaway } from '@/components/stats/chartTakeaway';
import { ratingHeadline } from '@/components/stats/ratingHeadline';
import { ScoreBar } from '@/components/stats/ScoreBar';
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
  const userStat = useStatsStore((s) => s.userStat);
  const buckets = useStatsStore((s) => s.calibration.buckets);
  const headline = ratingHeadline(userStat);
  const groups = groupByDue(pending, new Date());

  const hero =
    headline && !headline.provisional ? (
      <View style={styles.rated}>
        <CountUp value={headline.rating} style={styles.ratingNumber} testID="home-rating" />
        <Text style={styles.ratingLabel}>calibration rating</Text>
        <ScoreBar score={headline.rating} testID="home-score-bar" />
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
      />
    );

  return (
    <SectionList
      style={styles.screen}
      contentContainerStyle={styles.content}
      sections={groups}
      keyExtractor={(p) => p.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={<View style={styles.hero}>{hero}</View>}
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
