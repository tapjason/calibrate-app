import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { chartVerdict } from '@/components/stats/chartTakeaway';
import { chartNamesLean, ratingDetailLines } from '@/components/stats/ratingHeadline';
import { ScoringSheet } from '@/components/stats/ScoringSheet';
import { useLocalDay } from '@/components/ui/useLocalDay';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore, weekChangeFor } from '@/store/statsStore';

/**
 * "How scoring works", opened from Stats and Settings (roadmap step 29), and
 * from Today's identity line with `?section=badges`, where it opens at the
 * Badges section (roadmap D27), with the × pinned above it (blind playtest
 * 2026-11-12e, finding 1).
 */
export default function ScoringScreen() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  // From a rating (step 173; Insights' "What does this mean?" since D76): the
  // person's own lines first, in full, the ones Insights' page left out.
  const userStat = useStatsStore((s) => s.userStat);
  const perfect = useStatsStore((s) => s.perfect);
  const ratingRange = useStatsStore((s) => s.ratingRange);
  const buckets = useStatsStore((s) => s.calibration.buckets);
  const resolved = usePredictionStore((s) => s.resolved);
  // Since last week, read as Insights reads it (roadmap D37).
  const day = useLocalDay();
  const weekChange = useMemo(() => weekChangeFor(resolved, new Date()), [resolved, day]);
  const ratingLines =
    section === 'rating'
      ? ratingDetailLines({
          userStat,
          perfect,
          chartLeans: chartNamesLean(chartVerdict(buckets, false)?.lean),
          ratingRange,
          weekChange,
        })
      : null;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScoringSheet
        onClose={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/insights' as never);
        }}
        openAt={section === 'badges' ? 'Badges' : section === 'streak' ? 'Your streak' : null}
        ratingLines={ratingLines}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
