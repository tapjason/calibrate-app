import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { chosenProps } from '@/components/ui/chosen';
import { CategoryIcon } from '@/components/ui/Icon';
import { colors, radius, space, type } from '@/constants/theme';
import { categoryOptions, categoryTitle, useCategoryStore } from '@/store/categoryStore';
import type { Category } from '@/types';

/**
 * Past this many choices the row shows the first ones and "N more": thirteen
 * chips pushed Log's confidence to y 557 and its due date to 695 of 844
 * (playtest 2026-11-08, finding 13).
 */
export const CATEGORY_CHIPS_COLLAPSE_AFTER = 8;
const CATEGORY_CHIPS_SHOWN = 6;
/**
 * After "N more" or "Show fewer", chip taps are ignored this long: the row
 * changes under the finger, and the second tap of a double tap chose
 * whichever chip had moved there (playtest 2026-11-08b, finding 4).
 */
export const CATEGORY_CHIPS_SETTLE_MS = 400;

/**
 * The choices shown while collapsed: the first few in order, plus the chosen
 * one wherever it is in the list, so the current choice is always visible.
 * Exported for tests.
 */
export function visibleCategories(
  options: readonly Category[],
  value: Category | null,
  expanded: boolean,
): Category[] {
  if (expanded || options.length <= CATEGORY_CHIPS_COLLAPSE_AFTER) return [...options];
  const first = options.slice(0, CATEGORY_CHIPS_SHOWN);
  return value !== null && options.includes(value) && !first.includes(value)
    ? [...first, value]
    : first;
}

interface CategoryChipsProps {
  /** Null until one is chosen (roadmap D29): nothing is preset. */
  value: Category | null;
  onChange: (category: Category) => void;
}

/**
 * The category chips (DESIGN_SYSTEM §7.12): symbol + word, the chosen one
 * tinted with a bolder label, never colour alone. Shared by Log and an open
 * prediction's Edit (§7.23), so the two can't drift apart. The person's
 * own list (roadmap D39): the built-ins under their names, the ones they
 * added, and none they hid, unless it is the one already chosen.
 */
export function CategoryChips({ value, onChange }: CategoryChipsProps) {
  useCategoryStore((s) => s.defs);
  const options = categoryOptions({ keep: value });
  const [expanded, setExpanded] = useState(false);
  const toggledAt = useRef(0);
  const toggle = (next: boolean) => {
    toggledAt.current = Date.now();
    setExpanded(next);
  };
  const choose = (c: Category) => {
    if (Date.now() - toggledAt.current < CATEGORY_CHIPS_SETTLE_MS) return;
    onChange(c);
  };
  const shown = visibleCategories(options, value, expanded);
  const more = options.length - shown.length;
  // Expanded, the list can fold again (finding 21).
  const canFold = expanded && options.length > CATEGORY_CHIPS_COLLAPSE_AFTER;
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Category">
      {shown.map((c) => (
        <Pressable
          key={c}
          onPress={() => choose(c)}
          testID={`category-${c}`}
          accessibilityRole="radio"
          accessibilityLabel={`Category: ${categoryTitle(c)}`}
          {...chosenProps('radio', value === c)}
          style={[styles.chip, styles.chipWithIcon, value === c && styles.chipActive]}
        >
          <CategoryIcon
            category={c}
            size={15}
            color={value === c ? colors.onAction : colors.textSecondary}
          />
          <Text
            style={[styles.chipText, styles.chipTextFit, value === c && styles.chipTextActive]}
            numberOfLines={1}
          >
            {categoryTitle(c)}
          </Text>
        </Pressable>
      ))}
      {more > 0 && (
        <Pressable
          onPress={() => toggle(true)}
          testID="category-more"
          accessibilityRole="button"
          accessibilityLabel={`Show ${more} more ${more === 1 ? 'category' : 'categories'}`}
          style={[styles.chip, styles.chipWithIcon]}
        >
          <Text style={styles.chipText}>{more} more</Text>
        </Pressable>
      )}
      {canFold && (
        <Pressable
          onPress={() => toggle(false)}
          testID="category-fewer"
          accessibilityRole="button"
          style={[styles.chip, styles.chipWithIcon]}
        >
          <Text style={styles.chipText}>Show fewer</Text>
        </Pressable>
      )}
    </View>
  );
}

export const chipStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  chip: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  // Selected = tint + bolder label, not colour alone (DESIGN_SYSTEM §7.12).
  // Selected = ink fill and a white label (roadmap D33), plus the bolder weight:
  // decisive, like a switch that's on, and never colour alone.
  chipActive: { backgroundColor: colors.action, borderColor: colors.action },
  chipText: { ...type.subhead, color: colors.textPrimary },
  capitalize: { textTransform: 'capitalize' },
  // A long name stays inside the row with an ellipsis instead of running off
  // it (playtest 2026-11-08, finding 1): the chip is never wider than the
  // row, and its label is what gives way.
  chipWithIcon: { alignItems: 'center', flexDirection: 'row', gap: 6, maxWidth: '100%' },
  chipTextFit: { flexShrink: 1 },
  chipTextActive: { color: colors.onAction, fontWeight: '700' },
});

const styles = chipStyles;
