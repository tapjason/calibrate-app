import { Pressable, StyleSheet, Text, View } from 'react-native';

import { chosenProps } from '@/components/ui/chosen';
import { CategoryIcon } from '@/components/ui/Icon';
import { colors, radius, space, type } from '@/constants/theme';
import { CATEGORIES, type Category } from '@/types';

interface CategoryChipsProps {
  /** Null until one is chosen (roadmap D29): nothing is preset. */
  value: Category | null;
  onChange: (category: Category) => void;
}

/**
 * The category chips (DESIGN_SYSTEM §7.12): symbol + word, the chosen one
 * tinted with a bolder label, never colour alone. Shared by Log and an open
 * prediction's Edit (§7.23), so the two can't drift apart.
 */
export function CategoryChips({ value, onChange }: CategoryChipsProps) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {CATEGORIES.map((c) => (
        <Pressable
          key={c}
          onPress={() => onChange(c)}
          testID={`category-${c}`}
          accessibilityRole="radio"
          accessibilityLabel={`Category: ${c}`}
          {...chosenProps('radio', value === c)}
          style={[styles.chip, styles.chipWithIcon, value === c && styles.chipActive]}
        >
          <CategoryIcon
            category={c}
            size={15}
            color={value === c ? colors.brand800 : colors.textSecondary}
          />
          <Text style={[styles.chipText, styles.capitalize, value === c && styles.chipTextActive]}>
            {c}
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
  chipActive: { backgroundColor: colors.brand50, borderColor: colors.brand600 },
  chipText: { ...type.subhead, color: colors.textPrimary },
  capitalize: { textTransform: 'capitalize' },
  chipWithIcon: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  chipTextActive: { color: colors.brand800, fontWeight: '700' },
});

const styles = chipStyles;
