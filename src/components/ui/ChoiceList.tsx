import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, type } from '@/constants/theme';

interface ChoiceListProps {
  /** What the group is asking, for a screen reader. */
  label: string;
  options: readonly [string, string];
  selected: 0 | 1 | null;
  onSelect: (index: 0 | 1) => void;
  /** Each option's testID is `${idPrefix}-${index}`. */
  idPrefix: string;
}

/**
 * Two answers as full-width radio rows: the Warmup's and the daily practice's
 * question (one component, so the two look and read the same). A radio mark
 * carries the selection as well as the tint, so colour is never alone (§0.5).
 */
export function ChoiceList({ label, options, selected, onSelect, idPrefix }: ChoiceListProps) {
  return (
    <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option, i) => (
        <Pressable
          key={option}
          testID={`${idPrefix}-${i}`}
          accessibilityRole="radio"
          accessibilityState={{ selected: selected === i }}
          onPress={() => onSelect(i as 0 | 1)}
          style={[styles.option, selected === i && styles.optionActive]}
        >
          <View style={[styles.radio, selected === i && styles.radioOn]}>
            {selected === i && <View style={styles.radioDot} />}
          </View>
          <Text style={[styles.optionText, selected === i && styles.optionTextActive]}>{option}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  options: { gap: 10 },
  option: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.controlBorder,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  radio: {
    alignItems: 'center',
    borderColor: colors.controlBorder,
    borderRadius: 999,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  radioOn: { borderColor: colors.brand600 },
  radioDot: { backgroundColor: colors.brand600, borderRadius: 999, height: 10, width: 10 },
  optionActive: { backgroundColor: colors.brand50, borderColor: colors.brand600 },
  optionText: { ...type.body, color: colors.textPrimary, flex: 1 },
  // brand800, the ink meant for brand50: brand700 sank to 2:1 on it in dark (D7).
  optionTextActive: { color: colors.brand800, fontWeight: '600' },
});
