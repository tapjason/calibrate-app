import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  emptyHistoryMessage,
  filterHistory,
  firstHistoryCopy,
  parseRangeParam,
  rangeText,
  type FirstHistoryAction,
} from '@/components/prediction/historyFilter';
import { PredictionCard } from '@/components/prediction/PredictionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { colors, radius, space, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';
import { confidenceRangeLow } from '@/store/statsStore';
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
  const router = useRouter();
  const navigation = useNavigation();
  const resolved = usePredictionStore((s) => s.resolved);
  const pending = usePredictionStore((s) => s.pending);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  // A confidence range arrives from a tap on Stats' coverage row (roadmap
  // step 51): the predictions behind one dot on the chart.
  const range = parseRangeParam(useLocalSearchParams<{ range?: string }>().range);

  const clearRange = useCallback(() => {
    // This screen's own params, even while another tab is taking focus.
    navigation.setParams({ range: undefined } as never);
  }, [navigation]);
  // Leaving History drops the range, so the tab opens on everything next time
  // instead of a filter set from another screen days ago.
  useFocusEffect(useCallback(() => clearRange, [clearRange]));

  const filtered = useMemo(
    () => filterHistory(resolved, { category: filter, range }, confidenceRangeLow),
    [resolved, filter, range],
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
      {range !== null && (
        <Pressable
          onPress={clearRange}
          accessibilityRole="button"
          accessibilityLabel={`Showing what you said ${range} to ${range + 20} percent. Show every range.`}
          hitSlop={{ top: 4, bottom: 4 }}
          style={styles.rangeChip}
          testID="history-range"
        >
          <Text style={styles.rangeChipText}>You said {rangeText(range)}</Text>
          <Icon sf="xmark" fallback="close" size={14} color={colors.brand800} />
        </Pressable>
      )}
      {/* One scrolling row of filters rather than chips wrapping to two, and
          only once there is something to filter (roadmap step 33). */}
      {resolved.length > 0 && (
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
      )}
      {filtered.length > 0 && (
        <Text style={styles.summary} testID="history-summary">
          {summary}
        </Text>
      )}
      {filtered.length === 0 ? (
        resolved.length === 0 ? (
          // Nothing resolved at all: when the first answer can come, and a
          // way forward (roadmap step 69). A filtered-empty list has the
          // filters for that.
          (() => {
            const first = firstHistoryCopy(pending, new Date());
            const go = (action: FirstHistoryAction) => {
              if (action.kind === 'resolve') router.push(`/resolve/${action.id}` as never);
              else if (action.kind === 'run') router.push('/resolve/run' as never);
              else router.push('/log' as never);
            };
            return (
              <EmptyState
                testID="history-empty"
                symbol={{ sf: 'clock.arrow.circlepath', fallback: 'time-outline' }}
                message={first.message}
                actionLabel={first.action.label}
                onAction={() => go(first.action)}
              />
            );
          })()
        ) : (
          <EmptyState
            testID="history-empty"
            symbol={{ sf: 'clock.arrow.circlepath', fallback: 'time-outline' }}
            message={emptyHistoryMessage({ category: filter, range })}
          />
        )
      ) : (
        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PredictionCard
              prediction={item}
              // Only a skip can be revisited: it never counted (roadmap step 39).
              onPress={
                item.status === 'skipped'
                  ? (id) => router.push(`/resolve/${id}` as never)
                  : undefined
              }
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space.lg, backgroundColor: colors.canvas },
  // flexShrink 0: in a column, a horizontal ScrollView is allowed to shrink,
  // and on web it shrank to its chips' borders under the list.
  filters: { flexGrow: 0, flexShrink: 0, marginBottom: space.md },
  list: { flex: 1 },
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
  // Selected styling, like a chosen category, plus an × that clears it.
  rangeChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.brand50,
    borderColor: colors.brand600,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.sm,
    minHeight: 36,
    paddingHorizontal: space.md,
  },
  rangeChipText: { ...type.subhead, color: colors.brand800, fontWeight: '600' },
});
