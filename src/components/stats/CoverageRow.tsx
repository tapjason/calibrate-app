import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '@/constants/theme';
import type { BucketStat } from '@/types';

interface CoverageRowProps {
  buckets: readonly BucketStat[];
}

const EDGES = [0, 20, 40, 60, 80] as const;

/**
 * Which confidence ranges the score actually covers (DESIGN_SYSTEM §7.2 item
 * 4). Most people only log things they expect to happen, which leaves the low
 * buckets empty and the score measuring half the range — CLAUDE.md's range
 * coverage caveat, made visible.
 *
 * Empty ranges get a dashed outline and the word "none", so the gap reads
 * without colour.
 */
export function CoverageRow({ buckets }: CoverageRowProps) {
  const byLow = new Map(buckets.map((b) => [b.low, b.total_resolved]));
  const lowUsed = (byLow.get(0) ?? 0) + (byLow.get(20) ?? 0) > 0;

  return (
    <View style={styles.wrap} testID="coverage-row">
      <View style={styles.row}>
        {EDGES.map((low) => {
          const n = byLow.get(low) ?? 0;
          const label = `${low}–${low + 20}%`;
          return (
            <View
              key={low}
              testID={`coverage-${low}`}
              style={[styles.cell, n === 0 && styles.empty]}
              accessible
              accessibilityLabel={`${label}: ${n === 0 ? 'none yet' : `${n} resolved`}`}
            >
              <Text style={styles.range}>{label}</Text>
              <Text style={[styles.count, n === 0 && styles.countEmpty]}>
                {n === 0 ? 'none' : n}
              </Text>
            </View>
          );
        })}
      </View>
      {buckets.length > 0 && !lowUsed && (
        <Text style={styles.note} testID="coverage-note">
          You haven&apos;t logged anything under 40% yet, so your score only covers the
          confident half of your range.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginTop: space.md },
  row: { flexDirection: 'row', gap: space.xs },
  cell: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    paddingVertical: space.sm,
  },
  empty: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.controlBorder,
    borderStyle: 'dashed',
  },
  range: { ...type.caption, color: colors.textSecondary },
  count: { ...type.headline, color: colors.textPrimary },
  countEmpty: { ...type.footnote, color: colors.textTertiary },
  note: { ...type.footnote, color: colors.textSecondary },
});
