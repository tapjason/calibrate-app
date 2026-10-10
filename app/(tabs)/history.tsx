import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';

import {
  emptyHistoryMessage,
  filterHistory,
  firstHistoryCopy,
  openForHistory,
  parseRangeParam,
  rangeText,
  type FirstHistoryAction,
} from '@/components/prediction/historyFilter';
import { isReadyToResolve } from '@/components/prediction/dueGroups';
import { PredictionCard } from '@/components/prediction/PredictionCard';
import { chosenProps } from '@/components/ui/chosen';
import { EmptyState } from '@/components/ui/EmptyState';
import { holdRanges } from '@/components/ui/holdRanges';
import { useLocalDay } from '@/components/ui/useLocalDay';
import { Icon } from '@/components/ui/Icon';
import { colors, radius, space, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';
import { confidenceRangeLow } from '@/store/statsStore';
import { CATEGORIES, type Category } from '@/types';

const FILTERS: readonly (Category | 'all')[] = ['all', ...CATEGORIES];

export default function HistoryScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  // The empty state says when the first answer can come: keep it to the calendar.
  useLocalDay();
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
  // Open ones first (roadmap D26): two testers looked here for the prediction
  // they had just made and thought it was lost.
  const open = useMemo(
    () => openForHistory(pending, { category: filter, range }),
    [pending, filter, range],
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
          <Text style={styles.rangeChipText}>You said {holdRanges(rangeText(range))}</Text>
          <Icon sf="xmark" fallback="close" size={14} color={colors.brand800} />
        </Pressable>
      )}
      {/* One scrolling row of filters rather than chips wrapping to two, and
          only once there is something to filter (roadmap step 33). */}
      {resolved.length + pending.length > 0 && (
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
              {...chosenProps('toggle', filter === f)}
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
      {filtered.length === 0 && open.length === 0 ? (
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
            message={holdRanges(emptyHistoryMessage({ category: filter, range }))}
          />
        )
      ) : (
        <SectionList
          // A new filter is a new list, read from its newest. Without the key
          // it kept the old scroll offset: a range opened from Stats after
          // scrolling History showed the last three of its eight.
          key={`${filter}-${range ?? 'any'}`}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          sections={[
            ...(open.length > 0 ? [{ key: 'open', title: 'Open', data: open }] : []),
            ...(filtered.length > 0 ? [{ key: 'answered', title: 'Answered', data: filtered }] : []),
          ]}
          keyExtractor={(p) => p.id}
          renderSectionHeader={({ section }) =>
            // One section needs no header; with both, each says what it holds.
            open.length > 0 ? (
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {section.title} · {section.data.length}
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <PredictionCard
              prediction={item}
              onPress={
                item.status === 'pending'
                  ? // Due: Resolve. Not yet: its details (roadmap D25).
                    (id) =>
                      router.push(
                        (isReadyToResolve(item, new Date())
                          ? `/resolve/${id}`
                          : `/prediction/${id}`) as never,
                      )
                  : // Only a skip can be revisited: it never counted (step 39).
                    item.status === 'skipped'
                    ? (id) => router.push(`/resolve/${id}` as never)
                    : undefined
              }
            />
          )}
          ListFooterComponent={
            filtered.length === 0 ? (
              // Open ones listed, nothing answered yet under this filter.
              <Text style={styles.footer} testID="history-answered-empty">
                {resolved.length === 0
                  ? firstHistoryCopy(pending, new Date()).message
                  : holdRanges(emptyHistoryMessage({ category: filter, range }))}
              </Text>
            ) : null
          }
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
  listContent: { paddingBottom: space.xxl },
  row: { flexDirection: 'row', gap: space.sm, paddingVertical: 4 },
  summary: { ...type.footnote, color: colors.textSecondary, marginBottom: space.sm },
  sectionTitle: {
    ...type.footnote,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: space.sm,
    marginTop: space.md,
  },
  footer: { ...type.subhead, color: colors.textSecondary, marginTop: space.lg },
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
