import { useScrollToTop } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { nextDueLine } from '@/components/prediction/dueGroups';
import { unlockEstimateLine } from '@/components/stats/beforeScoreCopy';
import { CalibrationView } from '@/components/stats/CalibrationView';
import { CoachPanel } from '@/components/stats/CoachPanel';
import { coachSample } from '@/components/stats/patternCopy';
import { PlusTeaser } from '@/components/stats/PlusTeaser';
import { TrendsPanel } from '@/components/stats/TrendsPanel';
import { wholeMonthsSince } from '@/components/stats/wholeMonthsSince';
import { Button } from '@/components/ui/Button';
import { useLocalDay } from '@/components/ui/useLocalDay';
import { space } from '@/constants/theme';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePredictionStore } from '@/store/predictionStore';
import {
  sameDayAnswerCount,
  unlockEstimateFor,
  useStatsStore,
  weekChangeFor,
} from '@/store/statsStore';
import { MIN_N_BAND } from '@/types';

export default function InsightsScreen() {
  const router = useRouter();
  const scroll = useRef<ScrollView>(null);
  // A second tap on the tab scrolls back to the top, as iOS tabs do
  // (playtest 2026-11-08b, finding 13).
  useScrollToTop(scroll);
  // The calibrating caption names the next due date: keep it to the calendar
  // (the day is read below, for "since last week").
  const userStat = useStatsStore((s) => s.userStat);
  const categoryStats = useStatsStore((s) => s.categoryStats);
  const calibration = useStatsStore((s) => s.calibration);
  const ratingRange = useStatsStore((s) => s.ratingRange);
  const brier = useStatsStore((s) => s.brier);
  const brierBaseline = useStatsStore((s) => s.brierBaseline);
  const categoryRanges = useStatsStore((s) => s.categoryRanges);
  const furthestOff = useStatsStore((s) => s.furthestOff);
  const categoryCounts = useStatsStore((s) => s.categoryCounts);
  const resolved = usePredictionStore((s) => s.resolved);
  // "Since last week" depends on the day (roadmap D37): recomputed when the
  // answers or the local day change, not on every render.
  const day = useLocalDay();
  const weekChange = useMemo(() => weekChangeFor(resolved, new Date()), [resolved, day]);
  // One Coach card on the person's own numbers, once the rating is unlocked
  // (roadmap D37): a power user wouldn't pay for Coach unseen.
  const unlocked = !!userStat && !userStat.rating_is_provisional;
  const sample = useMemo(
    () => (unlocked ? coachSample(calibration.buckets, MIN_N_BAND) : null),
    [unlocked, calibration.buckets],
  );
  const nextBadges = useStatsStore((s) => s.nextBadges);
  const pending = usePredictionStore((s) => s.pending);
  // When the rating could unlock at the recent pace (roadmap D53).
  const estimate = useMemo(() => {
    if (unlocked) return null;
    const now = new Date();
    const e = unlockEstimateFor(resolved, pending, now);
    return e ? unlockEstimateLine(e, now) : null;
  }, [unlocked, resolved, pending, day]);
  // "Can't tell" answers, said beside the rating (roadmap D34).
  const skippedCount = usePredictionStore(
    (s) => s.resolved.filter((p) => p.status === 'skipped').length,
  );
  // Answers given the day they were logged, which aren't scored (D41).
  const sameDayCount = usePredictionStore((s) => sameDayAnswerCount(s.resolved));
  // Deleted after their answer or due day, on this phone (roadmap D45).
  const deletedCount = usePredictionStore((s) => s.deletedCount);
  const isPlus = useEntitlementStore((s) => s.isPlus);
  // Time since the first answer, not the calendar months with one in them.
  const firstResolvedAt = useStatsStore((s) => s.trends.first_resolved_at);
  const monthsOnFile = wholeMonthsSince(firstResolvedAt, new Date());

  return (
    <ScrollView ref={scroll}>
      <CalibrationView
        userStat={userStat}
        calibration={calibration}
        categoryStats={categoryStats}
        nextBadges={nextBadges}
        pendingCount={pending.length}
        nextDue={nextDueLine(pending, new Date(), {
          first: (userStat?.total_resolved ?? 0) === 0,
        })}
        onExplain={() => router.push('/scoring' as never)}
        // The predictions behind a range, in History (roadmap step 51).
        onSelectRange={(low) => router.push(`/history?range=${low}` as never)}
        ratingRange={ratingRange}
        brier={brier}
        brierBaseline={brierBaseline}
        skippedCount={skippedCount}
        sameDayCount={sameDayCount}
        deletedCount={deletedCount}
        categoryRanges={categoryRanges}
        furthestOff={furthestOff}
        weekChange={weekChange}
        categoryCounts={categoryCounts}
        unlockEstimate={estimate}
      />
      {/* Free users get one Plus teaser, not a grey upsell per panel. */}
      {!isPlus && (
        <PlusTeaser
          monthsOnFile={monthsOnFile}
          sample={sample}
          onUpgrade={() => router.push('/paywall?from=stats' as never)}
        />
      )}
      <CoachPanel
        upsell={false}
        onUpgrade={() => router.push('/paywall?from=stats_coach' as never)}
        onSignIn={() => router.push('/account' as never)}
      />
      <TrendsPanel
        upsell={false}
        onUpgrade={() => router.push('/paywall?from=stats_trends' as never)}
      />
      <View style={styles.actions}>
        <Button
          label="Share my card"
          testID="stats-share"
          onPress={() => router.push('/share' as never)}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actions: { padding: 16, paddingTop: 0, paddingBottom: space.xxl },
});
