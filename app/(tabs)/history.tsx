import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PredictionCard } from '@/components/prediction/PredictionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, radius, space, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';
import type { Category } from '@/types';

const FILTERS: readonly (Category | 'all')[] = [
  'all',
  'work',
  'health',
  'finance',
  'social',
  'personal',
];

export default function HistoryScreen() {
  const resolved = usePredictionStore((s) => s.resolved);
  const [filter, setFilter] = useState<Category | 'all'>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? resolved : resolved.filter((p) => p.category === filter)),
    [resolved, filter],
  );

  // Plain counts for the current filter — facts, never a verdict.
  const yes = filtered.filter((p) => p.status === 'resolved_yes').length;
  const no = filtered.filter((p) => p.status === 'resolved_no').length;
  const skipped = filtered.length - yes - no;
  const summary = [
    `${yes + no} answered`,
    `${yes} happened`,
    skipped > 0 ? `${skipped} not scored` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.wrap}>
      {/* One scrolling row of filters rather than chips wrapping to two. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={styles.filters}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f }}
            // 36pt chip + 4pt slop each side = the 44pt minimum target.
            hitSlop={{ top: 4, bottom: 4 }}
            style={[styles.chip, filter === f && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {filtered.length > 0 && (
        <Text style={styles.summary} testID="history-summary">
          {summary}
        </Text>
      )}
      {filtered.length === 0 ? (
        <EmptyState
          testID="history-empty"
          message={
            filter === 'all'
              ? 'Resolved predictions collect here, with how each one turned out.'
              : `Nothing resolved in ${filter} yet.`
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PredictionCard prediction={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space.lg, backgroundColor: colors.canvas },
  filters: { flexGrow: 0, marginBottom: space.md },
  row: { flexDirection: 'row', gap: space.sm, paddingVertical: 4 },
  summary: { ...type.footnote, color: colors.textSecondary, marginBottom: space.sm },
  chip: {
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  // Selected = tint + bolder label, not colour alone (DESIGN_SYSTEM §7.12).
  chipActive: { backgroundColor: colors.brand50, borderColor: colors.brand600 },
  chipText: { ...type.subhead, color: colors.textPrimary, textTransform: 'capitalize' },
  chipTextActive: { color: colors.brand800, fontWeight: '600' },
});
