import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

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

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
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
      </View>
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
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', marginBottom: space.md },
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
