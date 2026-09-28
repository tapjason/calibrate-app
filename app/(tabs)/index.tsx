import { useRouter } from 'expo-router';
import { SectionList, StyleSheet, Text, View } from 'react-native';

import { groupByDue } from '@/components/prediction/dueGroups';
import { PredictionCard } from '@/components/prediction/PredictionCard';
import { ratingHeadline } from '@/components/stats/ratingHeadline';
import { UnlockProgress } from '@/components/stats/UnlockProgress';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, space, tabularNums, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';
import { MIN_N_OVERALL } from '@/types';

export default function HomeScreen() {
  const router = useRouter();
  const pending = usePredictionStore((s) => s.pending);
  const userStat = useStatsStore((s) => s.userStat);
  const headline = ratingHeadline(userStat);
  const groups = groupByDue(pending, new Date());

  const hero =
    headline && !headline.provisional ? (
      <View style={styles.rated}>
        <Text style={styles.ratingNumber} testID="home-rating">
          {headline.rating}
        </Text>
        <Text style={styles.ratingLabel}>calibration rating</Text>
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
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {section.title} · {section.data.length}
        </Text>
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
  sectionTitle: {
    ...type.eyebrow,
    color: colors.textSecondary,
    marginBottom: space.sm,
    marginTop: space.md,
  },
});
