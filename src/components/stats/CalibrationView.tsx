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
import { firstLookLine } from '@/components/stats/beforeScoreCopy';
import {
  chartNamesLean,
  perfectLine,
  ratingHeadline,
  ratingMeaningLine,
  spreadThinLine,
} from '@/components/stats/ratingHeadline';
import { ScoreBar } from '@/components/stats/ScoreBar';
import { UnlockProgress } from '@/components/stats/UnlockProgress';
import { useStreakNow } from '@/components/stats/useStreakNow';
import { CountUp } from '@/components/ui/CountUp';
import { localCount } from '@/components/ui/count';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { holdRanges } from '@/components/ui/holdRanges';
import { colors, space, tabularNums, type } from '@/constants/theme';
import type { BrierEdge, CategoryMiss, WeekChange } from '@/store/statsStore';
import { useCategoryStore, visibleCategoryTitle } from '@/store/categoryStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  BRIER_MIN_N,
  MIN_N_OVERALL,
  type CalibrationResult,
  type Category,
  type CategoryCounts,
  type CategoryStat,
  type NextBadgeTarget,
  type RatingRange,
  type UserStat,
  type PerfectReference,
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
  /** Whether the Brier gap is more than luck (step 173). */
  brierEdge?: BrierEdge | null;
  /** What perfect calibration would score on the same answers (D62). */
  perfect?: PerfectReference | null;
  /**
   * Answers marked "Can't tell", which the rating leaves out (roadmap D34):
   * said beside it, so a record with the misses parked as skips shows it.
   */
  skippedCount?: number;
  /**
   * Every answer given, Can't tell and same-day ones included, so the Can't
   * tell line shows from the first answer (step 173).
   */
  answeredCount?: number;
  /** Due dates moved later on the eve or after, on this phone (step 173). */
  postponedCount?: number;
  /**
   * Scored answers now filed in another category than they belong to: moved
   * after they were answered (step 184), or before, after the day they were
   * made, and answered elsewhere (review round 6).
   */
  refiledCount?: number;
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
  /** Plain counts over every category, for the first look at 10 (D62). */
  overallCounts?: CategoryCounts | null;
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
  brierEdge = null,
  perfect = null,
  skippedCount = 0,
  answeredCount = 0,
  postponedCount = 0,
  refiledCount = 0,
  sameDayCount = 0,
  deletedCount = 0,
  categoryRanges = {},
  furthestOff = null,
  weekChange = null,
  categoryCounts = {},
  unlockEstimate = null,
  overallCounts = null,
}: CalibrationViewProps) {
  // Re-render on a rename (roadmap D39): "Furthest off" kept the old name
  // until something else redrew Insights (blind playtest 2026-11-12d, run 2).
  useCategoryStore((s) => s.defs);
  // The streak beside the count only while it's shown (step 173), and as it
  // stands now, as Today reads it: the stored one waits for a write, so it
  // outlived a streak that had ended (record audit, 2026-11-18).
  const streakShown = useSettingsStore((s) => s.streakShown);
  const streak = useStreakNow().streak;
  // Names the person chose stay out of view while the words are hidden (D62).
  const hideTitles = useSettingsStore((s) => s.hideTitles);
  const headline = ratingHeadline(userStat);
  const [showTable, setShowTable] = useState(false);
  const [showFine, setShowFine] = useState(false);
  // The lines under the rating that only some people want (D62), in their
  // old order: the Brier line (secondary and quiet, D24; from BRIER_MIN_N,
  // D62), then what the record leaves out or counted.
  const finePrint: { id: string; text: string }[] = [];
  if (
    userStat &&
    headline &&
    !headline.provisional &&
    brier !== null &&
    brierBaseline !== null &&
    userStat.total_resolved >= BRIER_MIN_N
  ) {
    finePrint.push({
      id: 'stats-brier',
      text: brierLine(
        brier,
        brierBaseline,
        brierEdge ? { edge: brierEdge, scored: userStat.total_resolved } : null,
      ),
    });
  }
  // At zero too (roadmap D57), from the first answer (step 173).
  if (answeredCount > 0) finePrint.push({ id: 'stats-skipped', text: skippedLine(skippedCount) });
  if (sameDayCount > 0) finePrint.push({ id: 'stats-same-day', text: sameDayLine(sameDayCount) });
  if (deletedCount > 0) finePrint.push({ id: 'stats-deleted', text: deletedLine(deletedCount) });
  if (postponedCount > 0) {
    finePrint.push({ id: 'stats-postponed', text: postponedLine(postponedCount) });
  }
  if (refiledCount > 0) finePrint.push({ id: 'stats-refiled', text: refiledLine(refiledCount) });
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
  // The furthest-off category's badge and score, as its row prints them.
  const furthestStat = furthestOff
    ? categoryStats.find((c) => c.category === furthestOff.category)
    : undefined;
  const furthestBadge =
    furthestStat && furthestStat.badge_level !== 'guesser' && !furthestStat.score_is_provisional
    ? {
        level: furthestStat.badge_level,
        score: Math.round(furthestStat.calibration_score),
        giveOrTake: categoryRanges?.[furthestStat.category]?.giveOrTake ?? 0,
      }
    : null;
  // The give-or-take line opens "how firm it is" when it's there (D68).
  const hasRange = !!ratingRange && ratingRange.giveOrTake > 0;
  const spread = userStat
    ? spreadThinLine(
        userStat.total_resolved,
        categoryStats.map((c) => c.predictions_resolved),
        FIRST_BADGE_AT,
      )
    : null;

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
              firstLook={firstLookLine(overallCounts)}
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
              {/* The lines under the rating in three groups, 12 apart and 4
                  within (D68; "a wall" in five playtest rounds as six equal
                  lines): what the number means, how firm it is, the count.
                  Margins on the lines themselves, so nothing is wrapped and
                  VoiceOver's order and stops stay as they were. */}
              {/* What the number means, in points (step 173): the lead. */}
              <Text style={styles.lead} testID="stats-rating-meaning">
                {ratingMeaningLine(headline.rating)}
              </Text>
              {/* How much of that gap luck alone gives (D62): with the lead,
                  whose figure its endings answer ("above that"). */}
              {perfect && (
                <Text style={styles.subtle} testID="stats-perfect">
                  {perfectLine(
                    headline.rating,
                    perfect,
                    userStat.total_resolved,
                    chartNamesLean(takeaway.lean),
                  )}
                </Text>
              )}
              {/* How firm it is: whichever of the two comes first opens it. */}
              {ratingRange && hasRange && (
                <Text style={[styles.subtle, styles.groupStart]} testID="stats-rating-range">
                  Give or take {ratingRange.giveOrTake}{' '}
                  {ratingRange.giveOrTake === 1 ? 'point' : 'points'} with this many predictions.
                </Text>
              )}
              {/* Free (roadmap D37): nothing free showed change over time. */}
              {weekChange && (
                <Text
                  style={[styles.subtle, !hasRange && styles.groupStart]}
                  testID="stats-week-change"
                >
                  {weekChangeLine(weekChange, ratingRange?.giveOrTake ?? 0)}
                </Text>
              )}
            </>
          )}
          {/* The fine print, folded under one line (D62; blind playtest
              2026-11-13c, finding 11: the lines under the rating read as a
              wall). One tap shows them all, and each is the line it was. */}
          {/* The progress bar already counts resolutions while provisional. */}
          {!headline.provisional && (
            // The third group (D68): 12 below the line before it.
            <Text style={[styles.subtle, styles.groupStart]}>
              {localCount(userStat.total_resolved)} scored
              {streak > 0 && streakShown ? `, ${localCount(streak)}-day streak` : ''}
            </Text>
          )}
          {/* After the count, so it doesn't read as the count's heading. */}
          {finePrint.length > 0 && (
            <Pressable
              onPress={() => setShowFine((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showFine }}
              aria-expanded={showFine}
              hitSlop={8}
              style={styles.tableToggle}
              testID="stats-fine-toggle"
            >
              <Text style={styles.tableToggleText}>
                {/* One name and its undo (blind playtest 2026-11-13e: "fine
                    print" read as something hidden). */}
                {showFine ? 'Show less' : 'More about your record'}
              </Text>
            </Pressable>
          )}
          {showFine &&
            finePrint.map((line) => (
              <Text key={line.id} style={styles.subtle} testID={line.id}>
                {line.text}
              </Text>
            ))}
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
          {furthestOffLine(
            furthestOff,
            furthestBadge,
            visibleCategoryTitle(furthestOff.category, hideTitles),
          )}
        </Text>
      )}
      {/* When a first badge can come (roadmap D36): a first-timer saw a tier
          name and nothing about when another could arrive. */}
      {/* Spread thin: why no badge yet (step 173). */}
      {spread !== null && (
        <Text style={styles.empty} testID="badges-spread">
          {spread}
        </Text>
      )}
      {spread === null && categoryStats.every((c) => c.predictions_resolved < FIRST_BADGE_AT) && (
        <Text style={styles.empty} testID="badges-first">
          {/* Tracker, or higher: Forecaster needs 20 too (blind playtest
              2026-11-12e, run 5 went from Getting started to Forecaster). */}
          A category earns its first badge at {FIRST_BADGE_AT} scored answers there: Tracker, or
          higher if its score is already high enough. Until then it shows Getting started, which
          means fewer than {FIRST_BADGE_AT} scored there.
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
  // What the number means leads the lines under the rating (D68): a step up
  // and in ink. Scales freely with Dynamic Type, as `subtle` and the chart's
  // subtitle (also `subhead`) do.
  lead: { ...type.subhead, color: colors.textPrimary, marginTop: space.md },
  // The first line of a group under the rating (D68): within a group 4, between 12.
  groupStart: { marginTop: space.md },
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
  // Present tense: a Can't tell can still be answered for a week
  // (SKIP_ANSWER_DAYS), so the count can still go down (record audit
  // 2026-11-12).
  if (skipped === 0) return 'No answers are Can’t tell.';
  return skipped === 1
    ? '1 answer is Can’t tell, so it isn’t scored.'
    : `${skipped} answers are Can’t tell, so they aren’t scored.`;
}

/**
 * "2 predictions were deleted after they were answered, after the day they
 * were logged, or once they were due." (roadmap D45). A miss could be deleted
 * within a day of its answer, or an open call once its outcome was in sight,
 * and nothing showed it. Each case the store counts (`deletionCounts`): a
 * scored answer (inside its 24-hour window); an open one on any day after the
 * day it was logged (owner decision 2026-11-19, review round 7; from the eve
 * of its due day until then, D61), a rewording since changing nothing; or an
 * open one already due, even on the day it was logged (a time-zone change, a
 * synced row). A Can't tell is counted as an open one is (owner's list item
 * 20, 2026-11-19), and the words hold for it unchanged: counted only after
 * the day it was logged or once due. Tombstones don't sync, so the count is
 * this phone's, and the line says so.
 */
export function deletedLine(count: number): string {
  return count === 1
    ? '1 prediction was deleted after it was answered, after the day it was logged, or once it was due. Only this phone keeps this count.'
    : `${count} predictions were deleted after they were answered, after the day they were logged, or once they were due. Only this phone keeps this count.`;
}

/**
 * "1 prediction had its due date moved later, its words changed, or its
 * category changed, within a day of its due day." (step 173, aggregate B1;
 * rewording added by D62, a category change by D69 (e)). A known miss could
 * be moved past its due day, rewritten on its eve or moved out of its
 * category, and answered later; counted as a late delete is (D45), once per
 * prediction, on this phone only.
 */
export function postponedLine(count: number): string {
  return count === 1
    ? '1 prediction had its due date moved later, its words changed, or its category changed, within a day of its due day. Only this phone keeps this count.'
    : `${count} predictions had their due dates moved later, their words changed, or their categories changed, within a day of their due day. Only this phone keeps this count.`;
}

/**
 * "1 scored answer was moved to another category, before or after it was
 * answered." (step 184, D65; before it was answered since review round 6). A
 * category's score follows where an answer is filed, so a miss moved out
 * leaves it; counted as a late delete and a late move are, on this phone
 * only. Counted after the answer, or before it (after the day it was made,
 * then answered in another category than the one it had at that first move).
 * One moved back isn't counted. Every case counted is a move to another
 * category, so the line names the move, not where the prediction started: a
 * category fixed on the day it was made isn't remembered, so "the one it
 * started in" could be the very category it ends up in.
 */
export function refiledLine(count: number): string {
  return count === 1
    ? '1 scored answer was moved to another category, before or after it was answered. Only this phone keeps this count.'
    : `${count} scored answers were moved to another category, before or after they were answered. Only this phone keeps this count.`;
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
