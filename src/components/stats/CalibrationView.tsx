import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CalibrationChart } from '@/components/stats/CalibrationChart';
import { CategoryBadge } from '@/components/stats/CategoryBadge';
import { chartTakeaway, rangeLabel } from '@/components/stats/chartTakeaway';
import { CoverageRow } from '@/components/stats/CoverageRow';
import { ratingHeadline } from '@/components/stats/ratingHeadline';
import { ScoreBar } from '@/components/stats/ScoreBar';
import { UnlockProgress } from '@/components/stats/UnlockProgress';
import { CountUp } from '@/components/ui/CountUp';
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
  const [showTable, setShowTable] = useState(false);
  const takeaway = chartTakeaway(calibration.buckets, headline?.provisional ?? true);

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
              <CountUp value={headline.rating} style={styles.rating} testID="rating-value" />
              <Text style={styles.ratingLabel}>calibration rating</Text>
              <ScoreBar score={headline.rating} testID="stats-score-bar" />
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

      {/* Title = takeaway, subtitle = natural frequencies (DESIGN_SYSTEM §7.2). */}
      <Text style={styles.chartTitle} testID="chart-takeaway">
        {takeaway.title}
      </Text>
      {takeaway.subtitle && <Text style={styles.chartSubtitle}>{takeaway.subtitle}</Text>}

      {/* Drawn even when empty: a ghost frame shows what's coming. */}
      <CalibrationChart buckets={calibration.buckets} />
      {calibration.buckets.length === 0 && (
        <Text style={styles.empty}>Resolve a prediction and your first dot lands here.</Text>
      )}

      <CoverageRow buckets={calibration.buckets} />

      {calibration.buckets.length > 0 && (
        <>
          <Pressable
            onPress={() => setShowTable((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showTable }}
            hitSlop={8}
            testID="chart-table-toggle"
            style={styles.tableToggle}
          >
            <Text style={styles.tableToggleText}>
              {showTable ? 'Hide table' : 'Show as table'}
            </Text>
          </Pressable>
          {showTable &&
            calibration.buckets.map((b) => (
              <View key={b.low} style={styles.bucketRow} testID={`bucket-${b.low}`}>
                <Text style={styles.bucketLabel}>{rangeLabel(b)}</Text>
                <Text style={styles.bucketDetail}>
                  said {Math.round(b.stated_confidence_mean)}% · happened{' '}
                  {Math.round(b.actual_rate * 100)}%
                </Text>
                <Text style={styles.bucketCount}>n={b.total_resolved}</Text>
              </View>
            ))}
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
  chartTitle: { ...type.title3, color: colors.textPrimary, marginBottom: space.xs },
  chartSubtitle: { ...type.subhead, color: colors.textSecondary, marginBottom: space.md },
  tableToggle: { alignSelf: 'flex-start', marginTop: space.md, paddingVertical: space.xs },
  tableToggleText: { ...type.subhead, color: colors.brandText, fontWeight: '600' },
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
