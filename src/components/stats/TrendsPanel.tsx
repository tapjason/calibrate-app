import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { track } from '@/analytics/track';
import { Button } from '@/components/ui/Button';
import { colors } from '@/constants/theme';
import { csvFileName, predictionsToCsv } from '@/export/csv';
import { shareTextFile, type ExportOutcome } from '@/export/file';
import { useEntitlementStore } from '@/store/entitlementStore';
import { usePredictionStore } from '@/store/predictionStore';
import { useStatsStore } from '@/store/statsStore';
import type { CategoryTrend, PeriodStat, TrendSummary } from '@/engine/trends';

const EXPORT_MESSAGES: Record<Exclude<ExportOutcome, 'shared'>, string> = {
  unavailable: "Exporting isn't available on this device.",
  failed: "Couldn't build the file. Try again?",
};

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
export function TrendsPanel({ onUpgrade }: { onUpgrade?: () => void } = {}) {
  const isPlus = useEntitlementStore((s) => s.isPlus);
  const trends = useStatsStore((s) => s.trends);
  const pending = usePredictionStore((s) => s.pending);
  const resolved = usePredictionStore((s) => s.resolved);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const hasHistory = trends.periods.length > 0;

  if (!isPlus) {
    return (
      <View style={styles.wrap} testID="trends-upsell">
        <Text style={styles.heading}>Trends</Text>
        <Text style={styles.muted}>
          {hasHistory
            ? `Plus charts your calibration month by month — ${trends.periods.length} ${
                trends.periods.length === 1 ? 'month' : 'months'
              } on file — drills into each category, and exports the lot as CSV.`
            : 'Plus charts your calibration month by month, drills into each category, and exports the lot as CSV.'}
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

  const onExport = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const all = [...pending, ...resolved];
      const outcome = await shareTextFile(
        csvFileName(),
        predictionsToCsv(all),
        'text/csv',
        'Export your predictions',
      );
      setMessage(outcome === 'shared' ? null : EXPORT_MESSAGES[outcome]);
      if (outcome === 'shared') void track('data_exported', { row_count: all.length });
    } finally {
      setExporting(false);
    }
  };

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

function CoverageLine({ trends }: { trends: TrendSummary }) {
  const { buckets_used, empty_buckets, middle_share } = trends.coverage;
  return (
    <View style={styles.coverage} testID="trends-coverage">
      <Text style={styles.rowLabel}>Range you use</Text>
      <Text style={styles.muted}>
        {buckets_used} of 5 confidence bands.{' '}
        {empty_buckets.length > 0
          ? `Nothing yet in ${empty_buckets.map((b) => `${b}–${b + 20}%`).join(', ')} — a score only covers the range you actually use.`
          : 'You use the whole range, which is what makes the score trustworthy.'}
      </Text>
      <Text style={styles.muted}>
        {Math.round(middle_share * 100)}% of your calls sit in the honest-uncertainty
        band (35–65%).
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
  heading: { fontSize: 17, fontWeight: '700' },
  muted: { color: '#6b7280', fontSize: 13, lineHeight: 19 },
  delta: { color: '#111827', fontSize: 15, lineHeight: 21 },
  section: { gap: 4 },
  sectionTitle: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rowLabel: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  rowValue: { color: '#4b5563', fontSize: 14 },
  coverage: { gap: 4, paddingTop: 4 },
});
