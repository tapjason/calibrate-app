import { StyleSheet, Text, View } from 'react-native';

import { useCsvExport } from '@/components/settings/useCsvExport';
import { monthsOnFileWords } from '@/components/stats/wholeMonthsSince';
import { Button } from '@/components/ui/Button';
import { holdRanges } from '@/components/ui/holdRanges';
import { colors, space, type } from '@/constants/theme';
import { useEntitlementStore } from '@/store/entitlementStore';
import { useStatsStore } from '@/store/statsStore';
import type {
  CategoryTrend,
  CorrectionRow,
  Horizon,
  HorizonStat,
  PeriodStat,
  TrendSummary,
} from '@/engine/trends';
import { MIN_N_BAND } from '@/types';
import { categoryLabel, categoryTitle, useCategoryStore } from '@/store/categoryStore';

/**
 * Advanced analytics (Plus) — the sticky, non-AI half of the subscription.
 *
 * GROWTH §5.3: AI converts but churns faster, so Plus needs something that
 * keeps paying off after the novelty. This is that: the long view of a
 * calibration record, which is worth more the longer someone has been logging.
 *
 * Free users see the section with its numbers withheld, not a hidden feature.
 * A locked door you can see is an upsell; one you can't is just an absence.
 */
export function TrendsPanel({
  onUpgrade,
  upsell = true,
}: {
  onUpgrade?: () => void;
  /** False when the screen shows one shared Plus teaser instead. */
  upsell?: boolean;
} = {}) {
  useCategoryStore((s) => s.defs); // re-render on a rename (roadmap D39)
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const trends = useStatsStore((s) => s.trends);
  // Free since D31: the same export as You's row, offered here too.
  const { exporting, message, run: onExport } = useCsvExport();

  const hasHistory = trends.periods.length > 0;
  // Time since the first answer; under a month, no number (wholeMonthsSince).
  const months = monthsOnFileWords(trends.first_resolved_at, new Date());

  if (!isPlus && !upsell) return null;

  if (!isPlus) {
    return (
      <View style={styles.wrap} testID="trends-upsell">
        <Text accessibilityRole="header" style={styles.heading}>Trends</Text>
        <Text style={styles.muted}>
          {months
            ? `Plus charts your calibration month by month — ${months} on file — and drills into each category.`
            : 'Plus charts your calibration month by month and drills into each category.'}
        </Text>
        {onUpgrade && (
          <Button
            label="See Plus"
            variant="secondary"
            testID="trends-upsell-cta"
            onPress={onUpgrade}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="trends-panel">
      <Text accessibilityRole="header" style={styles.heading}>Trends</Text>

      {!hasHistory ? (
        <Text style={styles.muted} testID="trends-empty">
          Answer a few predictions and your month-by-month record shows up here.
        </Text>
      ) : (
        <>
          <DeltaLine trends={trends} />
          <Section title="Month by month">
            {trends.periods.slice(-6).map((period) => (
              <PeriodRow key={period.period} period={period} />
            ))}
          </Section>
          <Section title="By category">
            {trends.categories.map((category) => (
              <CategoryRow key={category.category} trend={category} />
            ))}
          </Section>
          {trends.horizons.length > 0 && (
            <Section title="By how far ahead">
              {trends.horizons.map((h) => (
                <HorizonRow key={h.horizon} stat={h} />
              ))}
            </Section>
          )}
          <Corrections trends={trends} />
          <CoverageLine trends={trends} />
        </>
      )}

      <Button
        label={exporting ? 'Preparing…' : 'Export CSV'}
        variant="secondary"
        disabled={exporting}
        testID="trends-export"
        onPress={() => void onExport()}
      />
      {message && (
        <Text style={styles.muted} testID="trends-export-message">
          {message}
        </Text>
      )}
    </View>
  );
}

function DeltaLine({ trends }: { trends: TrendSummary }) {
  const delta = trends.delta_recent;
  // Null means too little history to compare halves — say nothing rather than
  // reporting a movement of zero, which reads as "you haven't changed" when in
  // fact nothing has been measured yet.
  if (delta === null) return null;
  const rounded = Math.round(delta);
  const text =
    rounded === 0
      ? 'Your calibration is holding steady.'
      : rounded > 0
        ? `Your recent calls are ${rounded} points better calibrated than your earlier ones.`
        : `Your recent calls are ${Math.abs(rounded)} points worse calibrated than your earlier ones.`;
  return (
    <Text style={styles.delta} testID="trends-delta">
      {text}
    </Text>
  );
}

function PeriodRow({ period }: { period: PeriodStat }) {
  return (
    <View style={styles.row} testID={`trend-period-${period.period}`}>
      <Text style={styles.rowLabel}>{formatMonth(period.period)}</Text>
      <Text style={styles.rowValue}>
        {period.provisional
          ? `${period.resolved} scored`
          : `${Math.round(period.score)}, from ${period.resolved} scored`}
      </Text>
    </View>
  );
}

function CategoryRow({ trend }: { trend: CategoryTrend }) {
  return (
    <View style={styles.row} testID={`trend-category-${trend.category}`}>
      <Text style={[styles.rowLabel, styles.rowLabelName]} numberOfLines={1}>
        {categoryTitle(trend.category)}
      </Text>
      <Text style={styles.rowValue}>
        {/* A provisional category shows progress toward its threshold, never a
            score — the same rule the headline rating follows. */}
        {trend.provisional
          ? `${trend.resolved} scored ${trend.resolved === 1 ? 'answer' : 'answers'}, too few for a score`
          : `${Math.round(trend.score)}, ${trend.direction}`}
      </Text>
    </View>
  );
}

const HORIZON_LABELS: Record<Horizon, string> = {
  next_day: 'Next day or sooner',
  week: 'Within a week',
  month: 'Within a month',
  longer: 'Further out',
};

/**
 * Calibration by how far ahead the call was made (roadmap step 21). Same row
 * rule as a category: a thin horizon shows its count, never a score.
 */
function HorizonRow({ stat }: { stat: HorizonStat }) {
  return (
    <View style={styles.row} testID={`trend-horizon-${stat.horizon}`}>
      <Text style={styles.rowLabelPlain}>{HORIZON_LABELS[stat.horizon]}</Text>
      <Text style={styles.rowValue}>
        {stat.provisional
          ? `${stat.resolved} scored ${stat.resolved === 1 ? 'answer' : 'answers'}, too few for a score`
          : `${Math.round(stat.score)}, ${stat.direction}`}
      </Text>
    </View>
  );
}

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

/**
 * The personal correction table (roadmap step 20): what each confidence band
 * has actually meant, per category. The engine only returns bands with at
 * least MIN_N_BAND resolved, so nothing here can read 0% or 100% off two
 * predictions; while none qualify, it says which band is closest instead.
 */
function Corrections({ trends }: { trends: TrendSummary }) {
  const rows = trends.corrections;
  const progress = trends.correction_progress;
  if (rows.length === 0 && !progress) return null;

  // The largest gap that leans (the engine sorts leaning rows first, then by
  // gap), never a row inside luck: one at the top dropped the lead while a row
  // below it leaned (the one lean rule, D35; as headlineRange in chartTakeaway).
  const worst = rows.find((row) => row.direction !== 'calibrated');
  return (
    <Section title="What your confidence means">
      {rows.length === 0 && progress ? (
        <Text style={styles.muted} testID="trends-corrections-progress">
          A range needs {MIN_N_BAND} calls in one category before it gets a row.
          Closest: {categoryTitle(progress.category)} at {band(progress.low, progress.high)}, with{' '}
          {progress.resolved}.
        </Text>
      ) : (
        <>
          {worst && (
            <Text style={styles.delta} testID="trends-corrections-lead">
              In {categoryLabel(worst.category)}, your {band(worst.low, worst.high)} has come true{' '}
              {percent(worst.actual_rate)} of the time.
            </Text>
          )}
          <Text style={styles.muted}>
            How often each range came true, where you&apos;ve used it at least {MIN_N_BAND}{' '}
            times in one category.
          </Text>
          {rows.map((row) => (
            <CorrectionLine key={`${row.category}-${row.low}`} row={row} />
          ))}
        </>
      )}
    </Section>
  );
}

/** "60–80%", its dash held to both numbers (DESIGN_SYSTEM §7.9). */
function band(low: number, high: number): string {
  return holdRanges(`${low}–${high}%`);
}

function CorrectionLine({ row }: { row: CorrectionRow }) {
  return (
    <View style={styles.row} testID={`trend-correction-${row.category}-${row.low}`}>
      {/* The person's own name (up to 24 characters) wraps rather than pushing
          the figure off the row (playtest 2026-11-08, finding 1). */}
      <Text style={[styles.rowLabelPlain, styles.rowLabelName]}>
        {categoryTitle(row.category)} at {band(row.low, row.high)}
      </Text>
      <Text style={[styles.rowValue, styles.rowFigure]}>
        {percent(row.actual_rate)}, {row.happened} of {row.resolved}
      </Text>
    </View>
  );
}

function CoverageLine({ trends }: { trends: TrendSummary }) {
  const { buckets_used, empty_buckets, middle_share } = trends.coverage;
  return (
    <View style={styles.coverage} testID="trends-coverage">
      {/* Plain, not rowLabel: its textTransform read "Range You Use". */}
      <Text style={styles.rowLabelPlain}>Range you use</Text>
      <Text style={styles.muted}>
        {buckets_used} of 5 ranges of how sure.{' '}
        {empty_buckets.length > 0
          ? holdRanges(
              `Nothing yet in ${empty_buckets.map((b) => `${b}–${b + 20}%`).join(', ')} — a score only covers the range you actually use.`,
            )
          : 'You use the whole range, which is what makes the score trustworthy.'}
      </Text>
      <Text style={styles.muted}>
        {Math.round(middle_share * 100)}% of your calls sit in the middle of the range
        ({holdRanges('35–65%')}).
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** 'YYYY-MM' → 'Mar 2026'. Falls back to the raw key if it isn't parseable. */
function formatMonth(period: string): string {
  const [year, month] = period.split('-');
  const index = Number(month) - 1;
  const name = MONTHS[index];
  return name ? `${name} ${year}` : period;
}

const styles = StyleSheet.create({
  wrap: { gap: 12, padding: 16, paddingTop: 0 },
  heading: { ...type.headline, color: colors.textPrimary },
  muted: { ...type.footnote, color: colors.textSecondary },
  delta: { ...type.subhead, color: colors.textPrimary },
  section: { gap: 4 },
  // Sentence case, not ALL-CAPS grey (DESIGN_SYSTEM §7.9).
  sectionTitle: { ...type.eyebrow, color: colors.textSecondary, marginBottom: 2 },
  row: {
    flexDirection: 'row',
    gap: space.md,
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  // A category's name gives way to its figure (playtest 2026-11-08, finding 1).
  rowLabelName: { flexShrink: 1 },
  rowLabel: {
    ...type.subhead,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  // For labels that carry a number: textTransform would capitalize "at" too.
  rowLabelPlain: { ...type.subhead, color: colors.textPrimary, fontWeight: '500' },
  rowValue: { ...type.subhead, color: colors.textSecondary },
  // A short figure ("75%, 45 of 60") keeps to one line; the name beside it wraps.
  rowFigure: { flexShrink: 0 },
  coverage: { gap: 4, paddingTop: 4 },
});
