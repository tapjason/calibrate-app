import { Pressable, StyleSheet, Text, View } from 'react-native';

import { chosenProps } from '@/components/ui/chosen';
import { colors, radius, space, type } from '@/constants/theme';

/** Sunday first, as the digest always fell on it (index = settings digestDay). */
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

interface DayChipsProps {
  /** 0 = Sunday … 6 = Saturday. */
  value: number;
  onChange: (day: number) => void;
  testID: string;
}

/**
 * The weekly digest's day (roadmap D38): seven short chips in one radio
 * group, selected in ink with a bolder label (D33), each spoken in full.
 */
export function DayChips({ value, onChange, testID }: DayChipsProps) {
  return (
    <View
      style={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel="Digest day"
      testID={testID}
    >
      {DAY_NAMES.map((name, day) => {
        const on = day === value;
        return (
          <Pressable
            key={name}
            onPress={() => onChange(day)}
            accessibilityRole="radio"
            accessibilityLabel={name}
            {...chosenProps('radio', on)}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[styles.chip, on && styles.chipOn]}
            testID={`${testID}-${day}`}
          >
            <Text style={[styles.text, on && styles.textOn]}>{name.slice(0, 3)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.controlBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 44,
    paddingHorizontal: space.sm,
  },
  chipOn: { backgroundColor: colors.action, borderColor: colors.action },
  text: { ...type.footnote, color: colors.textPrimary },
  textOn: { color: colors.onAction, fontWeight: '600' },
});
