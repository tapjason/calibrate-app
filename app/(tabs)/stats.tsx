import { ScrollView } from 'react-native';

import { CalibrationView } from '@/components/stats/CalibrationView';
import { useStatsStore } from '@/store/statsStore';

export default function StatsScreen() {
  const userStat = useStatsStore((s) => s.userStat);
  const categoryStats = useStatsStore((s) => s.categoryStats);
  const calibration = useStatsStore((s) => s.calibration);

  return (
    <ScrollView>
      <CalibrationView
        userStat={userStat}
        calibration={calibration}
        categoryStats={categoryStats}
      />
    </ScrollView>
  );
}
