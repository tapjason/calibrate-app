import { StyleSheet, Text, View } from 'react-native';

import { useCsvExport } from '@/components/settings/useCsvExport';
import { Button } from '@/components/ui/Button';
import { holdRanges } from '@/components/ui/holdRanges';
import { colors, type } from '@/constants/theme';
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
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const trends = useStatsStore((s) => s.trends);
  // Free since D31: the same export as You's row, offered here too.
  const { exporting, message, run: onExport } = useCsvExport();

  const hasHistory = trends.periods.length > 0;

  if (!isPlus && !upsell) return null;

  if (!isPlus) {
    return (
      <View style={styles.wrap} testID="trends-upsell">
        <Text style={styles.heading}>Trends</Text>
        <Text style={styles.muted}>
          {hasHistory
            ? `Plus charts your calibration month by month — ${trends.periods.length} ${
                trends.periods.length === 1 ? 'month' : 'months'
              } on file — and drills into each category.`
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
      <Text style={styles.heading}>Trends</Text>

      {!hasHistory ? (
        <Text style={styles.muted} testID="trends-empty">
          Resolve a few predictions and your month-by-month record shows up here.
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
          ? `${period.resolved} resolved`
          : `${Math.round(period.score)} · ${period.resolved} resolved`}
      </Text>
    </View>
  );
}

function CategoryRow({ trend }: { trend: CategoryTrend }) {
  return (
    <View style={styles.row} testID={`trend-category-${trend.category}`}>
      <Text style={styles.rowLabel}>{trend.category}</Text>
      <Text style={styles.rowValue}>
        {/* A provisional category shows progress toward its threshold, never a
            score — the same rule the headline rating follows. */}
        {trend.provisional
          ? `${trend.resolved} resolved · too few to score`
          : `${Math.round(trend.score)} · ${trend.direction}`}
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
          ? `${stat.resolved} resolved · too few to score`
          : `${Math.round(stat.score)} · ${stat.direction}`}
      </Text>
    </View>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
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

  const worst = rows[0];
  return (
    <Section title="What your confidence means">
      {rows.length === 0 && progress ? (
        <Text style={styles.muted} testID="trends-corrections-progress">
          A band needs {MIN_N_BAND} calls in one category before it gets a row.
          Closest: {progress.category} at {band(progress.low, progress.high)}, with{' '}
          {progress.resolved}.
        </Text>
      ) : (
        <>
          {worst && worst.direction !== 'calibrated' && (
            <Text style={styles.delta} testID="trends-corrections-lead">
              In {worst.category}, your {band(worst.low, worst.high)} has come true{' '}
              {percent(worst.actual_rate)} of the time.
            </Text>
          )}
          <Text style={styles.muted}>
            How often each band came true, where you&apos;ve used it at least {MIN_N_BAND}{' '}
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
      <Text style={styles.rowLabelPlain}>
        {capitalize(row.category)} at {band(row.low, row.high)}
      </Text>
      <Text style={styles.rowValue}>
        {percent(row.actual_rate)} · {row.happened} of {row.resolved}
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
        {buckets_used} of 5 confidence bands.{' '}
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
      <Text style={styles.sectionTitle}>{title}</Text>
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
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rowLabel: {
    ...type.subhead,
    color: colors.textPrimary,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  // For labels that carry a number: textTransform would capitalize "at" too.
  rowLabelPlain: { ...type.subhead, color: colors.textPrimary, fontWeight: '500' },
  rowValue: { ...type.subhead, color: colors.textSecondary },
  coverage: { gap: 4, paddingTop: 4 },
});
