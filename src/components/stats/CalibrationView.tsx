import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BucketDots } from '@/components/stats/BucketDots';
import { brierLine } from '@/components/stats/brierLine';
import { CalibrationChart } from '@/components/stats/CalibrationChart';
import { CategoryBadge } from '@/components/stats/CategoryBadge';
import { chartTakeaway, rangeLabel } from '@/components/stats/chartTakeaway';
import { CoverageRow } from '@/components/stats/CoverageRow';
import { ratingHeadline } from '@/components/stats/ratingHeadline';
import { ScoreBar } from '@/components/stats/ScoreBar';
import { UnlockProgress } from '@/components/stats/UnlockProgress';
import { CountUp } from '@/components/ui/CountUp';
import { holdRanges } from '@/components/ui/holdRanges';
import { colors, space, tabularNums, type } from '@/constants/theme';
import {
  MIN_N_OVERALL,
  type CalibrationResult,
  type Category,
  type CategoryStat,
  type NextBadgeTarget,
  type RatingRange,
  type UserStat,
} from '@/types';

interface CalibrationViewProps {
  userStat: UserStat | null;
  calibration: CalibrationResult;
  categoryStats: CategoryStat[];
  nextBadges: Partial<Record<Category, NextBadgeTarget | null>>;
  /** Open predictions, shown as "on their way" while the rating is provisional. */
  pendingCount?: number;
  /** Opens "How scoring works" (roadmap step 29). */
  onExplain?: () => void;
  /** While calibrating, when the next one comes due (roadmap step 35). */
  nextDue?: string | null;
  /** Opens a confidence range's predictions in History (roadmap step 51). */
  onSelectRange?: (low: number) => void;
  /** "Give or take 3" on the rating (roadmap D4). */
  ratingRange?: RatingRange | null;
  /** The Brier score, one quiet line once the rating is unlocked (roadmap D24). */
  brier?: number | null;
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
  onExplain,
  nextDue = null,
  onSelectRange,
  ratingRange = null,
  brier = null,
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
              nextDue={nextDue}
            />
          ) : (
            <>
              {/* Number and label as one stop (roadmap step 43). */}
              <View
                style={styles.ratingGroup}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`Calibration rating, ${headline.rating} out of 100.`}
                testID="stats-rating-group"
              >
                <CountUp value={headline.rating} style={styles.rating} testID="rating-value" />
                <Text style={styles.ratingLabel}>calibration rating</Text>
              </View>
              <ScoreBar score={headline.rating} range={ratingRange} testID="stats-score-bar" />
              {ratingRange && ratingRange.giveOrTake > 0 && (
                <Text style={styles.subtle} testID="stats-rating-range">
                  Give or take {ratingRange.giveOrTake}{' '}
                  {ratingRange.giveOrTake === 1 ? 'point' : 'points'} with this many predictions.
                </Text>
              )}
              {/* Secondary and quiet (roadmap D24): it keeps the rating honest
                  for those who look, and stays out of everyone else's way. */}
              {brier !== null && (
                <Text style={styles.subtle} testID="stats-brier">
                  {brierLine(brier)}
                </Text>
              )}
            </>
          )}
          {/* The progress bar already counts resolutions while provisional. */}
          {!headline.provisional && (
            <Text style={styles.subtle}>
              {userStat.total_resolved} resolved
              {userStat.current_streak > 0 ? ` · ${userStat.current_streak}-day streak` : ''}
            </Text>
          )}
          {/* The math on demand, one tap from the number it explains. */}
          {onExplain && (
            <Pressable
              onPress={onExplain}
              accessibilityRole="button"
              hitSlop={8}
              style={styles.explain}
              testID="stats-explain"
            >
              <Text style={styles.tableToggleText}>How is this scored?</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {/* Title = takeaway, subtitle = natural frequencies (DESIGN_SYSTEM §7.2). */}
      <Text style={styles.chartTitle} testID="chart-takeaway">
        {holdRanges(takeaway.title)}
      </Text>
      {takeaway.subtitle && (
        <Text style={styles.chartSubtitle}>{holdRanges(takeaway.subtitle)}</Text>
      )}

      {/* Drawn even when empty: a ghost frame shows what's coming. */}
      <CalibrationChart buckets={calibration.buckets} />
      {calibration.buckets.length === 0 && (
        <Text style={styles.empty}>Resolve a prediction and your first dot lands here.</Text>
      )}

      <CoverageRow buckets={calibration.buckets} onSelectRange={onSelectRange} />

      {calibration.buckets.length > 0 && (
        <>
          <Pressable
            onPress={() => setShowTable((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showTable }}
            // The cross-platform prop as well: react-native-web maps this one (step 96).
            aria-expanded={showTable}
            hitSlop={8}
            testID="chart-table-toggle"
            style={styles.tableToggle}
          >
            <Text style={styles.tableToggleText}>
              {showTable ? 'Hide the counts' : 'Show the counts'}
            </Text>
          </Pressable>
          {showTable &&
            calibration.buckets.map((b) => (
              <View key={b.low} style={styles.bucket} testID={`bucket-${b.low}`}>
                <View style={styles.bucketRow}>
                  <Text style={styles.bucketLabel}>{rangeLabel(b)}</Text>
                  <Text style={styles.bucketDetail}>
                    said {Math.round(b.stated_confidence_mean)}% · happened{' '}
                    {Math.round(b.actual_rate * 100)}%
                    {/* The grey capsule's range, in numbers (roadmap D4). */}
                    {holdRanges(` · chance ${Math.round(b.chance_low * 100)}–${Math.round(b.chance_high * 100)}%`)}
                  </Text>
                  <Text style={styles.bucketCount}>n={b.total_resolved}</Text>
                </View>
                {/* The same range as dots (roadmap D4): filled happened,
                    the bar is where your numbers said they'd stop. */}
                <BucketDots
                  total={b.total_resolved}
                  happened={b.resolved_yes}
                  expected={b.expected_yes}
                  testID={`bucket-${b.low}-dots`}
                />
                <Text style={styles.bucketExpected} testID={`bucket-${b.low}-expected`}>
                  {b.resolved_yes} of {b.total_resolved} happened; your numbers expected about{' '}
                  {Math.round(b.expected_yes)}.
                </Text>
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
  ratingGroup: { alignItems: 'center' },
  subtle: { ...type.footnote, color: colors.textSecondary, marginTop: space.xs },
  // Sentence case, not ALL-CAPS grey (DESIGN_SYSTEM §7.9).
  sectionTitle: {
    ...type.eyebrow,
    color: colors.textSecondary,
    marginTop: space.xxl,
    marginBottom: space.sm,
  },
  // Apart from the chart's key above it, which it otherwise read as a line of.
  empty: { ...type.subhead, color: colors.textSecondary, marginTop: space.md },
  chartTitle: { ...type.title3, color: colors.textPrimary, marginBottom: space.xs },
  chartSubtitle: { ...type.subhead, color: colors.textSecondary, marginBottom: space.md },
  tableToggle: { alignSelf: 'flex-start', marginTop: space.md, paddingVertical: space.xs },
  explain: { marginTop: space.sm, paddingVertical: space.xs },
  tableToggleText: { ...type.subhead, color: colors.brandText, fontWeight: '600' },
  bucket: {
    borderBottomColor: colors.hairline,
    borderBottomWidth: 1,
    gap: space.xs,
    paddingVertical: space.sm,
  },
  bucketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bucketExpected: { ...type.caption, fontWeight: '400', color: colors.textSecondary },
  bucketLabel: { ...type.footnote, fontWeight: '500', color: colors.textPrimary, width: 64 },
  bucketDetail: { ...type.footnote, flex: 1, color: colors.textSecondary },
  bucketCount: { ...type.caption, ...tabularNums, color: colors.textTertiary, width: 40, textAlign: 'right' },
});
