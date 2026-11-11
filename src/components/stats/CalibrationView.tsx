import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BucketDots } from '@/components/stats/BucketDots';
import { brierLine } from '@/components/stats/brierLine';
import { CalibrationChart } from '@/components/stats/CalibrationChart';
import { CategoryBadge } from '@/components/stats/CategoryBadge';
import { chartTakeaway, rangeLabel } from '@/components/stats/chartTakeaway';
import { expectedPhrase } from '@/components/stats/expectedPhrase';
import { CoverageRow } from '@/components/stats/CoverageRow';
import { furthestOffLine, weekChangeLine } from '@/components/stats/patternCopy';
import { ratingHeadline } from '@/components/stats/ratingHeadline';
import { ScoreBar } from '@/components/stats/ScoreBar';
import { UnlockProgress } from '@/components/stats/UnlockProgress';
import { CountUp } from '@/components/ui/CountUp';
import { localCount } from '@/components/ui/count';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { holdRanges } from '@/components/ui/holdRanges';
import { colors, space, tabularNums, type } from '@/constants/theme';
import type { CategoryMiss, WeekChange } from '@/store/statsStore';
import {
  MIN_N_OVERALL,
  type CalibrationResult,
  type Category,
  type CategoryCounts,
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
  /** What saying the base rate every time would score, the Brier line's yardstick (D35). */
  brierBaseline?: { rate: number; score: number } | null;
  /**
   * Answers marked "Can't tell", which the rating leaves out (roadmap D34):
   * said beside it, so a record with the misses parked as skips shows it.
   */
  skippedCount?: number;
  /**
   * Answers given the day they were logged, which aren't scored (roadmap
   * D41): said beside the rating, before it unlocks too, so a count that
   * didn't move after an answer is explained.
   */
  sameDayCount?: number;
  /**
   * Predictions deleted after their answer or due day (roadmap D45), which
   * this phone counts: said beside the rating so a quiet delete shows.
   */
  deletedCount?: number;
  /** Each category score's give-or-take (roadmap D35). */
  categoryRanges?: Partial<Record<Category, RatingRange>>;
  /** The category furthest from what was said (roadmap D37), or null. */
  furthestOff?: CategoryMiss | null;
  /** The rating's change since last week (roadmap D37), or null. */
  weekChange?: WeekChange | null;
  /** Each category's plain counts, said before its score unlocks (roadmap D53). */
  categoryCounts?: Partial<Record<Category, CategoryCounts>>;
  /** When the rating could unlock at the recent pace (roadmap D53), or null. */
  unlockEstimate?: string | null;
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
  brierBaseline = null,
  skippedCount = 0,
  sameDayCount = 0,
  deletedCount = 0,
  categoryRanges = {},
  furthestOff = null,
  weekChange = null,
  categoryCounts = {},
  unlockEstimate = null,
}: CalibrationViewProps) {
  const headline = ratingHeadline(userStat);
  const [showTable, setShowTable] = useState(false);
  // Every badge pill in the list as wide as the widest, so the rows wrap
  // their pill under the words all together or not at all (playtest
  // 2026-11-08b, finding 18: at 320 some kept it on the right, others
  // dropped it under, by the length of the tier's name).
  // Learned afresh at each text size: the box reported includes the width
  // already set, so a smaller size would otherwise keep the larger one
  // (review, 2026-11-08).
  const { fontScale } = useWindowDimensions();
  const [pill, setPill] = useState({ scale: fontScale, width: 0 });
  const pillWidth = pill.scale === fontScale ? pill.width : 0;
  const notePill = useCallback(
    (w: number) =>
      setPill((prev) =>
        prev.scale !== fontScale
          ? { scale: fontScale, width: Math.ceil(w) }
          : w > prev.width + 0.5
            ? { scale: fontScale, width: Math.ceil(w) }
            : prev,
      ),
    [fontScale],
  );
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
              estimate={unlockEstimate}
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
              <ScoreBar score={headline.rating} range={ratingRange} caption testID="stats-score-bar" />
              {ratingRange && ratingRange.giveOrTake > 0 && (
                <Text style={styles.subtle} testID="stats-rating-range">
                  Give or take {ratingRange.giveOrTake}{' '}
                  {ratingRange.giveOrTake === 1 ? 'point' : 'points'} with this many predictions.
                </Text>
              )}
              {/* Free (roadmap D37): nothing free showed change over time. */}
              {weekChange && (
                <Text style={styles.subtle} testID="stats-week-change">
                  {weekChangeLine(weekChange, ratingRange?.giveOrTake ?? 0)}
                </Text>
              )}
              {/* Secondary and quiet (roadmap D24): it keeps the rating honest
                  for those who look, and stays out of everyone else's way. */}
              {brier !== null && brierBaseline !== null && (
                <Text style={styles.subtle} testID="stats-brier">
                  {brierLine(brier, brierBaseline)}
                </Text>
              )}
              {/* At zero too (roadmap D57): a sceptic worked out "none" from
                  155 rows (blind playtest 2026-11-10, run 8). */}
              <Text style={styles.subtle} testID="stats-skipped">
                {skippedLine(skippedCount, userStat.total_resolved)}
              </Text>
            </>
          )}
          {sameDayCount > 0 && (
            <Text style={styles.subtle} testID="stats-same-day">
              {sameDayLine(sameDayCount)}
            </Text>
          )}
          {deletedCount > 0 && (
            <Text style={styles.subtle} testID="stats-deleted">
              {deletedLine(deletedCount)}
            </Text>
          )}
          {/* The progress bar already counts resolutions while provisional. */}
          {!headline.provisional && (
            <Text style={styles.subtle}>
              {localCount(userStat.total_resolved)} scored
              {userStat.current_streak > 0
                ? `, ${localCount(userStat.current_streak)}-day streak`
                : ''}
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
      <Text accessibilityRole="header" style={styles.chartTitle} testID="chart-takeaway">
        {holdRanges(takeaway.title)}
      </Text>
      {takeaway.subtitle && (
        <Text style={styles.chartSubtitle}>{holdRanges(takeaway.subtitle)}</Text>
      )}

      {/* Drawn even when empty: a ghost frame shows what's coming. */}
      <CalibrationChart buckets={calibration.buckets} />
      {calibration.buckets.length === 0 && (
        <Text style={styles.empty}>Answer a prediction and your first dot lands here.</Text>
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
                    said {Math.round(b.stated_confidence_mean)}%, happened{' '}
                    {Math.round(b.actual_rate * 100)}%
                    {/* The grey capsule's range, in numbers (roadmap D4). */}
                    {holdRanges(`, chance ${Math.round(b.chance_low * 100)}–${Math.round(b.chance_high * 100)}%`)}
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
                  {/* One phrasing for an expected count, the chart title's (D57). */}
                  {b.resolved_yes} of {b.total_resolved} happened; your numbers expected{' '}
                  {expectedPhrase(b.expected_yes)}.
                </Text>
              </View>
            ))}
        </>
      )}

      <View style={styles.sectionGap}>
        <SectionHeader title="Category badges" />
      </View>
      {/* The area furthest off, said plainly (roadmap D37): a power user found
          her finance pattern only through History's filters. */}
      {furthestOff && (
        <Text style={styles.pattern} testID="stats-furthest-off">
          {furthestOffLine(furthestOff)}
        </Text>
      )}
      {/* When a first badge can come (roadmap D36): a first-timer saw a tier
          name and nothing about when another could arrive. */}
      {categoryStats.every((c) => c.predictions_resolved < FIRST_BADGE_AT) && (
        <Text style={styles.empty} testID="badges-first">
          A category earns its first badge, Tracker, at {FIRST_BADGE_AT} answered there.
        </Text>
      )}
      {categoryStats.length === 0 ? null : (
        categoryStats.map((c) => (
          <CategoryBadge
            key={c.category}
            stat={c}
            next={nextBadges[c.category] ?? null}
            giveOrTake={categoryRanges[c.category]?.giveOrTake ?? 0}
            pillMinWidth={pillWidth}
            onPillWidth={notePill}
            counts={categoryCounts[c.category] ?? null}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16 },
  pattern: { ...type.subhead, color: colors.textPrimary, marginBottom: space.sm },
  // Left-aligned with the chart and the rows below it (roadmap D33).
  summary: { alignItems: 'stretch', marginBottom: space.xxxl },
  // The hero numeral is always ink; colour belongs to direction, not to
  // good/bad (DESIGN_SYSTEM §2.4). Readout size: the chart is this screen's hero.
  rating: { ...type.readout, ...tabularNums, color: colors.textPrimary },
  ratingLabel: { ...type.subhead, color: colors.textSecondary, flexShrink: 1 },
  ratingGroup: { alignItems: 'baseline', flexDirection: 'row', gap: space.md },
  subtle: { ...type.footnote, color: colors.textSecondary, marginTop: space.xs },
  sectionGap: { marginTop: space.xl },
  // Apart from the chart's key above it, which it otherwise read as a line of.
  empty: { ...type.subhead, color: colors.textSecondary, marginTop: space.md },
  chartTitle: { ...type.title3, color: colors.textPrimary, marginBottom: space.xs },
  chartSubtitle: { ...type.subhead, color: colors.textSecondary, marginBottom: space.md },
  tableToggle: { alignSelf: 'flex-start', marginTop: space.md, paddingVertical: space.xs },
  explain: { marginTop: space.sm, paddingVertical: space.xs },
  tableToggleText: { ...type.subhead, color: colors.actionText, fontWeight: '600' },
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

/**
 * "2 answers were Can't tell, so they aren't scored." (roadmap D34), and
 * "No answers were Can't tell." at zero (D57).
 * The rating counts Yes and No only, so a habit of parking misses as skips
 * would flatter it unseen; said beside it, it can't.
 */
export function skippedLine(skipped: number, _scored?: number): string {
  // No "of N": skips plus scored answers left out same-day ones, a total
  // that matched no screen (record audit, 2026-11-09).
  if (skipped === 0) return 'No answers were Can’t tell.';
  return skipped === 1
    ? '1 answer was Can’t tell, so it isn’t scored.'
    : `${skipped} answers were Can’t tell, so they aren’t scored.`;
}

/**
 * "2 predictions were deleted after they were answered or due." (roadmap
 * D45). A miss could be deleted within a day of its answer, or an open call
 * just before it missed, and nothing showed it. Tombstones don't sync, so the
 * count is this phone's, and the line says so.
 */
export function deletedLine(count: number): string {
  return count === 1
    ? '1 prediction was deleted after it was answered or due. Only this phone keeps this count.'
    : `${count} predictions were deleted after they were answered or due. Only this phone keeps this count.`;
}

/**
 * "3 answers came the day they were logged, so they aren't scored." (roadmap
 * D41). Logging a sure thing and answering it at once bought a badge in
 * minutes; said beside the rating, the rule is never a surprise.
 */
export function sameDayLine(count: number): string {
  return count === 1
    ? '1 answer came the day it was logged, so it isn’t scored.'
    : `${count} answers came the day they were logged, so they aren’t scored.`;
}

/** Tracker's count (CLAUDE.md badge table): where a category's first badge comes. */
const FIRST_BADGE_AT = 20;
