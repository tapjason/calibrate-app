import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CalibrationView } from '@/components/stats/CalibrationView';
import { Button } from '@/components/ui/Button';
import { useStatsStore } from '@/store/statsStore';

export default function StatsScreen() {
  const router = useRouter();
  const userStat = useStatsStore((s) => s.userStat);
  const categoryStats = useStatsStore((s) => s.categoryStats);
  const calibration = useStatsStore((s) => s.calibration);
  const nextBadges = useStatsStore((s) => s.nextBadges);

  return (
    <ScrollView>
      <CalibrationView
        userStat={userStat}
        calibration={calibration}
        categoryStats={categoryStats}
        nextBadges={nextBadges}
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
