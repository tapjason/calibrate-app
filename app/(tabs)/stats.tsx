import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CalibrationView } from '@/components/stats/CalibrationView';
import { CoachPanel } from '@/components/stats/CoachPanel';
import { TrendsPanel } from '@/components/stats/TrendsPanel';
import { Button } from '@/components/ui/Button';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';

export default function StatsScreen() {
  const router = useRouter();
  const userStat = useStatsStore((s) => s.userStat);
  const categoryStats = useStatsStore((s) => s.categoryStats);
  const calibration = useStatsStore((s) => s.calibration);
  const nextBadges = useStatsStore((s) => s.nextBadges);
  const pendingCount = usePredictionStore((s) => s.pending.length);

  return (
    <ScrollView>
      <CalibrationView
        userStat={userStat}
        calibration={calibration}
        categoryStats={categoryStats}
        nextBadges={nextBadges}
        pendingCount={pendingCount}
      />
      <CoachPanel
        onUpgrade={() => router.push('/paywall?from=stats_coach' as never)}
        onSignIn={() => router.push('/account' as never)}
      />
      <TrendsPanel
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
