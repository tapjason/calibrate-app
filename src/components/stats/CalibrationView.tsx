import { StyleSheet, Text, View } from 'react-native';

import { CalibrationChart } from '@/components/stats/CalibrationChart';
import type { CalibrationResult, CategoryStat, UserStat } from '@/types';

interface CalibrationViewProps {
  userStat: UserStat | null;
  calibration: CalibrationResult;
  categoryStats: CategoryStat[];
}

const BUCKET_LABELS = ['0–20', '20–40', '40–60', '60–80', '80–100'];

/**
 * Calibration visualization. The hero is the calibration curve (stated vs.
 * actual, with a dashed perfect-calibration diagonal); below it each
 * non-empty bucket gets a row with the exact stated/actual numbers and the
 * sample size that point is built from.
 */
export function CalibrationView({
  userStat,
  calibration,
  categoryStats,
}: CalibrationViewProps) {
  return (
    <View style={styles.wrap}>
      {userStat ? (
        <View style={styles.summary}>
          <Text style={styles.rating}>{Math.round(userStat.calibration_rating)}</Text>
          <Text style={styles.ratingLabel}>calibration rating</Text>
          <Text style={styles.subtle}>
            {userStat.total_resolved} resolved · streak {userStat.current_streak}
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Calibration curve</Text>
      {calibration.buckets.length === 0 ? (
        <Text style={styles.empty}>
          Resolve a few predictions to see your calibration curve here.
        </Text>
      ) : (
        <>
          <CalibrationChart buckets={calibration.buckets} />
          {calibration.buckets.map((b) => {
            const labelIdx = Math.min(
              Math.floor(b.low / 20),
              BUCKET_LABELS.length - 1,
            );
            return (
              <View key={b.low} style={styles.bucketRow} testID={`bucket-${b.low}`}>
                <Text style={styles.bucketLabel}>{BUCKET_LABELS[labelIdx]}%</Text>
                <Text style={styles.bucketDetail}>
                  stated {Math.round(b.stated_confidence_mean)}% · actual{' '}
                  {Math.round(b.actual_rate * 100)}%
                </Text>
                <Text style={styles.bucketCount}>n={b.total_resolved}</Text>
              </View>
            );
          })}
        </>
      )}

      <Text style={styles.sectionTitle}>By category</Text>
      {categoryStats.length === 0 ? (
        <Text style={styles.empty}>No category data yet.</Text>
      ) : (
        categoryStats.map((c) => (
          <View key={c.category} style={styles.catRow} testID={`category-${c.category}`}>
            <Text style={styles.catName}>{c.category}</Text>
            <Text style={styles.catBadge}>{c.badge_level}</Text>
            <Text style={styles.catScore}>
              {Math.round(c.calibration_score)} · {c.predictions_resolved}/{c.predictions_made}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16 },
  summary: { alignItems: 'center', marginBottom: 24 },
  rating: { fontSize: 56, fontWeight: '700', color: '#2563eb' },
  ratingLabel: { fontSize: 14, color: '#6b7280' },
  subtle: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  empty: { color: '#9ca3af', fontStyle: 'italic' },
  bucketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  bucketLabel: { fontSize: 13, fontWeight: '500', color: '#374151', width: 64 },
  bucketDetail: { flex: 1, fontSize: 13, color: '#6b7280' },
  bucketCount: { fontSize: 11, color: '#9ca3af', width: 40, textAlign: 'right' },
  catRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  catName: { flex: 1, color: '#111827', textTransform: 'capitalize' },
  catBadge: { color: '#2563eb', fontWeight: '500', marginRight: 12 },
  catScore: { color: '#6b7280', fontSize: 13 },
});
