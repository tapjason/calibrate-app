import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { nextDueLine } from '@/components/prediction/dueGroups';
import { CalibrationView } from '@/components/stats/CalibrationView';
import { CoachPanel } from '@/components/stats/CoachPanel';
import { PlusTeaser } from '@/components/stats/PlusTeaser';
import { TrendsPanel } from '@/components/stats/TrendsPanel';
import { Button } from '@/components/ui/Button';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';

export default function StatsScreen() {
  const router = useRouter();
  const userStat = useStatsStore((s) => s.userStat);
  const categoryStats = useStatsStore((s) => s.categoryStats);
  const calibration = useStatsStore((s) => s.calibration);
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
        nextDue={nextDueLine(pending, new Date())}
        onExplain={() => router.push('/scoring' as never)}
        // The predictions behind a range, in History (roadmap step 51).
        onSelectRange={(low) => router.push(`/history?range=${low}` as never)}
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
  actions: { padding: 16, paddingTop: 0 },
});
