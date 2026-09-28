import { StyleSheet, Text, View } from 'react-native';

import { CalibrationChart } from '@/components/stats/CalibrationChart';
import { CategoryBadge } from '@/components/stats/CategoryBadge';
import { ratingHeadline } from '@/components/stats/ratingHeadline';
import { UnlockProgress } from '@/components/stats/UnlockProgress';
import { colors, space, tabularNums, type } from '@/constants/theme';
import {
  MIN_N_OVERALL,
  type CalibrationResult,
  type Category,
  type CategoryStat,
  type NextBadgeTarget,
  type UserStat,
} from '@/types';

interface CalibrationViewProps {
  userStat: UserStat | null;
  calibration: CalibrationResult;
  categoryStats: CategoryStat[];
  nextBadges: Partial<Record<Category, NextBadgeTarget | null>>;
  /** Open predictions, shown as "on their way" while the rating is provisional. */
  pendingCount?: number;
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
  nextBadges,
  pendingCount = 0,
}: CalibrationViewProps) {
  const headline = ratingHeadline(userStat);

  return (
    <View style={styles.wrap}>
      {userStat && headline ? (
        <View style={styles.summary}>
          {headline.provisional ? (
            // Never a countdown in the hero slot: "12" reads as a score of 12.
            <UnlockProgress
              testID="rating-provisional"
              resolved={userStat.total_resolved}
              pending={pendingCount}
              total={MIN_N_OVERALL}
            />
          ) : (
            <>
              <Text style={styles.rating} testID="rating-value">
                {headline.rating}
              </Text>
              <Text style={styles.ratingLabel}>calibration rating</Text>
            </>
          )}
          {/* The progress bar already counts resolutions while provisional. */}
          {!headline.provisional && (
            <Text style={styles.subtle}>
              {userStat.total_resolved} resolved · streak {userStat.current_streak}
            </Text>
          )}
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

      <Text style={styles.sectionTitle}>Category badges</Text>
      {categoryStats.length === 0 ? (
        <Text style={styles.empty}>No category data yet.</Text>
      ) : (
        categoryStats.map((c) => (
          <CategoryBadge
            key={c.category}
            stat={c}
            next={nextBadges[c.category] ?? null}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16 },
  summary: { alignItems: 'center', marginBottom: 24 },
  // The hero numeral is always ink; colour belongs to direction, not to
  // good/bad (DESIGN_SYSTEM §2.4).
  rating: { ...type.display, ...tabularNums, color: colors.textPrimary },
  ratingLabel: { ...type.subhead, color: colors.textSecondary },
  subtle: { ...type.footnote, color: colors.textSecondary, marginTop: space.xs },
  // Sentence case, not ALL-CAPS grey (DESIGN_SYSTEM §7.9).
  sectionTitle: {
    ...type.eyebrow,
    color: colors.textSecondary,
    marginTop: space.xxl,
    marginBottom: space.sm,
  },
  empty: { ...type.subhead, color: colors.textSecondary },
  bucketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  bucketLabel: { ...type.footnote, fontWeight: '500', color: colors.textPrimary, width: 64 },
  bucketDetail: { ...type.footnote, flex: 1, color: colors.textSecondary },
  bucketCount: { fontSize: 11, color: colors.textTertiary, width: 40, textAlign: 'right' },
});
