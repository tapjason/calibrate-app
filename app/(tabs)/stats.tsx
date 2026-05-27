import { useMemo } from 'react';
import { ScrollView } from 'react-native';

import { CalibrationView } from '@/components/stats/CalibrationView';
import { computeCalibration } from '@/engine/calibration';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';

export default function StatsScreen() {
  const resolved = usePredictionStore((s) => s.resolved);
  const userStat = useStatsStore((s) => s.userStat);
  const categoryStats = useStatsStore((s) => s.categoryStats);

  // Buckets are derived from the in-memory list — cheap and reactive to
  // store updates without an extra round-trip to the DB.
  const calibration = useMemo(() => computeCalibration(resolved), [resolved]);

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
