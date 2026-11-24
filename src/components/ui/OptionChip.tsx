import { Pressable, StyleSheet, Text } from 'react-native';

import { chosenProps } from '@/components/ui/chosen';
import { colors, radius, space, type } from '@/constants/theme';

interface OptionChipProps {
  title: string;
  /** A second line under the title ("8:00 AM" under "With coffee"). */
  subtitle?: string;
  /** The chosen one of its group. */
  active: boolean;
  disabled?: boolean;
  /** Two to a row, for four choices. */
  half?: boolean;
  /**
   * The chip sits on a `surfaceSunken` card (the offer under a finished
   * practice): an unchosen chip's edge takes `textTertiary`, since
   * `controlBorder` is 2.93:1 on the sunken fill in light (step 195).
   */
  onSunken?: boolean;
  onPress: () => void;
  testID: string;
}

/**
 * One choice in a radio group of a few named options under a label in You:
 * the practice reminder's moments (`MomentChips`, roadmap step 89) and "Lock
 * after" (D75). One chip, so the two look and read the same. The selection is
 * the outline and a weight change as well as the ink fill (§0.5, D33), and it
 * is said on web as well as iOS (`chosenProps`). Place it inside a View with
 * `accessibilityRole="radiogroup"` and the group's name.
 */
export function OptionChip({
  title,
  subtitle,
  active,
  disabled,
  half,
  onSunken = false,
  onPress,
  testID,
}: OptionChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      {...chosenProps('radio', active, !!disabled)}
      style={({ pressed }) => [
        styles.chip,
        half && styles.half,
        onSunken && styles.chipOnSunken,
        active && styles.chipActive,
        // A chosen chip keeps an ink fill while pressed: the sunken press
        // under its white label read 1.2:1 (step 195).
        pressed && (active ? styles.chipActivePressed : styles.chipPressed),
      ]}
      testID={testID}
    >
      <Text style={[styles.title, active && styles.titleActive]}>{title}</Text>
      {subtitle && <Text style={[styles.subtitle, active && styles.subtitleActive]}>{subtitle}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Growing to share the row: three moments fit one line on a 375pt card;
  // `half` sets four two and two rather than ragged.
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.controlBorder,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 64,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  // The thicker edge takes its extra point from the padding, so nothing shifts.
  // Ink fill and a white label when chosen (roadmap D33).
  chipActive: {
    backgroundColor: colors.action,
    borderColor: colors.action,
    borderWidth: 2,
    paddingHorizontal: space.sm - 1,
    paddingVertical: space.sm - 1,
  },
  chipPressed: { backgroundColor: colors.surfaceSunken },
  chipActivePressed: { backgroundColor: colors.actionPressed, borderColor: colors.actionPressed },
  // On a sunken card: 4.66:1 there in light, 4.92:1 in dark (theme.test.ts).
  chipOnSunken: { borderColor: colors.textTertiary },
  half: { flexBasis: '40%' },
  title: { ...type.subhead, color: colors.textPrimary, fontWeight: '500' },
  titleActive: { color: colors.onAction, fontWeight: '700' },
  subtitle: { ...type.caption, color: colors.textSecondary },
  subtitleActive: { color: colors.onAction },
});
