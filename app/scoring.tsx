import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ratingHeadline, ratingMeaningLine } from '@/components/stats/ratingHeadline';
import { ScoringSheet } from '@/components/stats/ScoringSheet';
import { useStatsStore } from '@/store/statsStore';

/**
 * "How scoring works", opened from Stats and Settings (roadmap step 29), and
 * from Today's identity line with `?section=badges`, where it opens at the
 * Badges section (roadmap D27), with the × pinned above it (blind playtest
 * 2026-11-12e, finding 1).
 */
export default function ScoringScreen() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  // From Today's rating (step 173): the person's own number first, in words.
  const headline = ratingHeadline(useStatsStore((s) => s.userStat));
  const ratingLine =
    section === 'rating' && headline && !headline.provisional
      ? `Your rating is ${headline.rating}. ${ratingMeaningLine(headline.rating, 'band')}`
      : null;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScoringSheet
        onClose={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/insights' as never);
        }}
        openAt={section === 'badges' ? 'Badges' : section === 'streak' ? 'Your streak' : null}
        ratingLine={ratingLine}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
