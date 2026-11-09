import { useScrollToTop } from '@react-navigation/native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';

import {
  emptyHistoryMessage,
  filterHistory,
  firstHistoryCopy,
  historySummary,
  openForHistory,
  parseRangeParam,
  rangeText,
  type FirstHistoryAction,
} from '@/components/prediction/historyFilter';
import { isReadyToResolve } from '@/components/prediction/dueGroups';
import { PredictionCard, rowPosition } from '@/components/prediction/PredictionCard';
import { chosenProps } from '@/components/ui/chosen';
import { EmptyState } from '@/components/ui/EmptyState';
import { holdRanges } from '@/components/ui/holdRanges';
import { useLocalDay } from '@/components/ui/useLocalDay';
import { Icon } from '@/components/ui/Icon';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors, radius, space, type } from '@/constants/theme';
import { usePredictionStore } from '@/store/predictionStore';
import { confidenceRangeLow } from '@/store/statsStore';
import { categoryOptions, categoryTitle, useCategoryStore } from '@/store/categoryStore';
import type { Category, Prediction } from '@/types';


export default function HistoryScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  // The empty state says when the first answer can come: keep it to the calendar.
  useLocalDay();
  const resolved = usePredictionStore((s) => s.resolved);
  const pending = usePredictionStore((s) => s.pending);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  // The person's own categories (roadmap D39) that have something to find,
  // hidden or not, plus the one chosen: with every category listed, 52 chips
  // ran about 4,000 pt, most of them empty (playtest 2026-11-08b, finding 21).
  useCategoryStore((s) => s.defs);
  const used = new Set([...resolved, ...pending].map((p) => p.category));
  const filters: (Category | 'all')[] = [
    'all',
    ...categoryOptions({ includeHidden: true }).filter((c) => used.has(c) || c === filter),
  ];
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

  // A new filter is a new list, read from its newest: without this it kept
  // the old scroll offset, and a range opened from Stats after scrolling
  // History showed the last three of its eight. Scrolled here rather than by
  // keying the list, which would remount the filter strip in its header and
  // snap it back to "All" on every tap (review, 2026-11-08).
  const listRef = useRef<SectionList<Prediction>>(null);
  // A second tap on the tab scrolls back to the top, as iOS tabs do
  // (playtest 2026-11-08b, finding 13).
  useScrollToTop(listRef);
  useEffect(() => {
    listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: false });
  }, [filter, range]);

  // Plain counts for the current filter, as the Answered heading counts.
  const summary = historySummary(filtered);

  // The filters and the summary scroll away with the list rather than
  // sitting fixed over it: fixed, they left the list 84 pt tall in landscape
  // and 168 at large text (playtest 2026-11-08, finding 7). With nothing to
  // list they sit above the empty state.
  const header = (
    <>
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
          <Icon sf="xmark" fallback="close" size={14} color={colors.selectedText} />
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
          {filters.map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="button"
              {...chosenProps('toggle', filter === f)}
              // 36pt chip + 4pt slop each side = the 44pt minimum target.
              hitSlop={{ top: 4, bottom: 4 }}
              style={[styles.chip, filter === f && styles.chipActive]}
            >
              <Text
                style={[styles.chipText, filter === f && styles.chipTextActive]}
                numberOfLines={1}
              >
                {f === 'all' ? 'All' : categoryTitle(f)}
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
    </>
  );

  // With nothing to list, the empty state sits under the filters inside the
  // same list, so the strip keeps its place and its scroll: rendered apart, it
  // remounted and snapped back to "All" when a filter had nothing in it.
  const empty =
    open.length > 0 || filtered.length > 0 ? null : resolved.length === 0 ? (
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
    );

  return (
    <View style={styles.wrap}>
      <SectionList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        sections={[
          ...(open.length > 0 ? [{ key: 'open', title: 'Open', data: open }] : []),
          ...(filtered.length > 0 ? [{ key: 'answered', title: 'Answered', data: filtered }] : []),
        ]}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderSectionHeader={({ section }) =>
          // One section needs no header; with both, each says what it holds.
          open.length > 0 ? (
            <SectionHeader title={section.title} count={section.data.length} unit={PREDICTIONS} />
          ) : null
        }
        renderItem={({ item, index, section }) => (
          <PredictionCard
            prediction={item}
            position={rowPosition(index, section.data.length)}
            onPress={
              item.status === 'pending'
                ? // Due: Resolve. Not yet: its details (roadmap D25).
                  (id) =>
                    router.push(
                      (isReadyToResolve(item, new Date())
                        ? `/resolve/${id}`
                        : `/prediction/${id}`) as never,
                    )
                : // A skip is answered in Resolve (step 39); a Yes or No opens
                  // its details, correctable for a day (roadmap D34).
                  item.status === 'skipped'
                  ? (id) => router.push(`/resolve/${id}` as never)
                  : (id) => router.push(`/prediction/${id}` as never)
            }
          />
        )}
        ListFooterComponent={
          filtered.length === 0 && open.length > 0 ? (
            // Open ones listed, nothing answered yet under this filter.
            <Text style={styles.footer} testID="history-answered-empty">
              {resolved.length === 0
                ? firstHistoryCopy(pending, new Date()).message
                : holdRanges(emptyHistoryMessage({ category: filter, range }))}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const PREDICTIONS = { one: 'prediction', other: 'predictions' };

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space.lg, backgroundColor: colors.canvas },
  // flexShrink 0: in a column, a horizontal ScrollView is allowed to shrink,
  // and on web it shrank to its chips' borders under the list.
  filters: { flexGrow: 0, flexShrink: 0, marginBottom: space.md },
  list: { flex: 1 },
  listContent: { paddingBottom: space.xxl },
  row: { flexDirection: 'row', gap: space.sm, paddingVertical: 4 },
  summary: { ...type.footnote, color: colors.textSecondary, marginBottom: space.sm },
  footer: { ...type.subhead, color: colors.textSecondary, marginTop: space.lg },
  // Capped so one long name can't fill the row (playtest 2026-11-08,
  // finding 1); the name ends in an ellipsis.
  chip: {
    justifyContent: 'center',
    maxWidth: 200,
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  // Selected = ink fill + bolder label, not colour alone (DESIGN_SYSTEM §7.12, D33).
  chipActive: { backgroundColor: colors.action, borderColor: colors.action },
  chipText: { ...type.subhead, color: colors.textPrimary },
  chipTextActive: { color: colors.onAction, fontWeight: '600' },
  // Selected styling, like a chosen category, plus an × that clears it.
  rangeChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.selectedFill,
    borderColor: colors.action,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.sm,
    minHeight: 36,
    paddingHorizontal: space.md,
  },
  rangeChipText: { ...type.subhead, color: colors.selectedText, fontWeight: '600' },
});
