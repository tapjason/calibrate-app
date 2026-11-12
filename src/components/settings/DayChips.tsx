import { useState } from 'react';
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

/** The space between chips (blind playtest 2026-11-12, finding 10). */
const GAP = space.sm;

/**
 * How wide each chip is in a row `rowWidth` wide, or undefined for seven
 * sharing one row. When seven don't fit, the rows are balanced, four and
 * three: shared out by flex, Saturday wrapped alone and stretched across the
 * row (playtest 2026-11-03), which an 8pt gap brought back at 320 wide.
 */
export function dayChipWidth(rowWidth: number, minWidth: number): number | undefined {
  const days = DAY_NAMES.length;
  if (rowWidth <= 0 || days * minWidth + (days - 1) * GAP <= rowWidth) return undefined;
  const fits = Math.max(1, Math.floor((rowWidth + GAP) / (minWidth + GAP)));
  const perRow = Math.ceil(days / Math.ceil(days / fits));
  return Math.floor((rowWidth - (perRow - 1) * GAP) / perRow);
}

interface DayChipsProps {
  /** 0 = Sunday … 6 = Saturday. */
  value: number;
  onChange: (day: number) => void;
  testID: string;
}

/**
 * The weekly digest's day (roadmap D38): seven short chips in one radio
 * group, selected in ink with a bolder label (D33). Each is named with its
 * visible three letters, the full day in the hint: Voice Control users say
 * what they see ("Tap Sun"), which "Sunday" didn't answer to (blind playtest
 * 2026-11-12, finding 2).
 */
export function DayChips({ value, onChange, testID }: DayChipsProps) {
  // Each chip is at least wide enough for its three letters at the current
  // text size; when seven don't fit, they wrap to a second row instead of
  // running together ("SuMorTueWe", playtest 2026-11-08, finding 9).
  const { fontScale } = useWindowDimensions();
  const minWidth = Math.ceil(31 * Math.max(fontScale, 1));
  const [rowWidth, setRowWidth] = useState(0);
  const width = dayChipWidth(rowWidth, minWidth);
  return (
    <View
      style={styles.row}
      onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
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
            accessibilityLabel={name.slice(0, 3)}
            accessibilityHint={`Weekly digest on ${name}`}
            {...chosenProps('radio', on)}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[
              styles.chip,
              { minWidth },
              width !== undefined && { flexBasis: width, flexGrow: 0, width },
              on && styles.chipOn,
            ]}
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
  // space.sm between chips: at xxs two selected-looking borders all but
  // touched (1 px apart, playtest 2026-11-08, finding 9), and at xs they were
  // still about 3 px apart, too close for a tremor or a stylus (blind
  // playtest 2026-11-12, finding 10).
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: space.sm },
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
