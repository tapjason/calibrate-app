import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

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
  // Each chip is at least wide enough for its three letters at the current
  // text size; when seven don't fit, they wrap to a second row instead of
  // running together ("SuMorTueWe", playtest 2026-11-08, finding 9).
  const { fontScale } = useWindowDimensions();
  const minWidth = Math.ceil(31 * Math.min(Math.max(fontScale, 1), 2));
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
            style={[styles.chip, { minWidth }, on && styles.chipOn]}
            testID={`${testID}-${day}`}
          >
            <Text style={[styles.text, on && styles.textOn]} numberOfLines={1}>
              {name.slice(0, 3)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // space.xs between chips: at xxs two selected-looking borders all but
  // touched (1 px apart, playtest 2026-11-08, finding 9).
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.controlBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    // Seven equal chips on one row: a basis of 0 shares the width evenly, so
    // nothing wraps at phone widths. With natural widths, Saturday wrapped
    // alone onto a second row (playtest 2026-11-03); at 320 points each is
    // still about 34 wide, enough for a three-letter day.
    flexBasis: 0,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: space.xxs,
  },
  chipOn: { backgroundColor: colors.action, borderColor: colors.action },
  text: { ...type.footnote, color: colors.textPrimary },
  textOn: { color: colors.onAction, fontWeight: '600' },
});
