import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { nextDueLine } from '@/components/prediction/dueGroups';
import { LOG_BUTTON_SIZE } from '@/components/prediction/LogButton';
import { CalibrationView } from '@/components/stats/CalibrationView';
import { CoachPanel } from '@/components/stats/CoachPanel';
import { PlusTeaser } from '@/components/stats/PlusTeaser';
import { TrendsPanel } from '@/components/stats/TrendsPanel';
import { Button } from '@/components/ui/Button';
import { useLocalDay } from '@/components/ui/useLocalDay';
import { space } from '@/constants/theme';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';

export default function InsightsScreen() {
  const router = useRouter();
  // The calibrating caption names the next due date: keep it to the calendar.
  useLocalDay();
  const userStat = useStatsStore((s) => s.userStat);
  const categoryStats = useStatsStore((s) => s.categoryStats);
  const calibration = useStatsStore((s) => s.calibration);
  const ratingRange = useStatsStore((s) => s.ratingRange);
  const nextBadges = useStatsStore((s) => s.nextBadges);
  const pending = usePredictionStore((s) => s.pending);
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const monthsOnFile = useStatsStore((s) => s.trends.periods.length);

  return (
    <ScrollView>
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
      />
      {/* Free users get one Plus teaser, not a grey upsell per panel. */}
      {!isPlus && (
        <PlusTeaser
          monthsOnFile={monthsOnFile}
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
  // Clears the floating "+" (roadmap D3).
  actions: { padding: 16, paddingTop: 0, paddingBottom: LOG_BUTTON_SIZE + space.xxxl },
});
