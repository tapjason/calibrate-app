import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { PredictionCard } from '@/components/prediction/PredictionCard';
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
            style={[styles.chip, filter === f && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f}
            </Text>
          </Pressable>
        ))}
      </View>
      {filtered.length === 0 ? (
        <Text style={styles.empty}>No resolved predictions yet.</Text>
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
  wrap: { flex: 1, padding: 16 },
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: 'white',
  },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: 'white' },
  empty: { color: '#9ca3af', fontStyle: 'italic' },
});
