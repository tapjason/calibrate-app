import { Pressable, StyleSheet, Text, View } from 'react-native';

import { chosenProps } from '@/components/ui/chosen';
import { CategoryIcon } from '@/components/ui/Icon';
import { colors, radius, space, type } from '@/constants/theme';
import { categoryLabel, categoryOptions, categoryTitle, useCategoryStore } from '@/store/categoryStore';
import type { Category } from '@/types';

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
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Category">
      {options.map((c) => (
        <Pressable
          key={c}
          onPress={() => onChange(c)}
          testID={`category-${c}`}
          accessibilityRole="radio"
          accessibilityLabel={`Category: ${categoryLabel(c)}`}
          {...chosenProps('radio', value === c)}
          style={[styles.chip, styles.chipWithIcon, value === c && styles.chipActive]}
        >
          <CategoryIcon
            category={c}
            size={15}
            color={value === c ? colors.onAction : colors.textSecondary}
          />
          <Text style={[styles.chipText, value === c && styles.chipTextActive]}>
            {categoryTitle(c)}
          </Text>
        </Pressable>
      ))}
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
  chipWithIcon: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  chipTextActive: { color: colors.onAction, fontWeight: '700' },
});

const styles = chipStyles;
