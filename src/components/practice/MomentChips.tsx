import { Pressable, StyleSheet, Text, View } from 'react-native';

import { chosenProps } from '@/components/ui/chosen';
import { colors, radius, space, type } from '@/constants/theme';
import { PRACTICE_REMINDER_MOMENTS, reminderTimeLabel } from '@/notifications/practiceReminder';
import type { PracticeReminderTime } from '@/store/settingsStore';

interface MomentChipsProps {
  /** The chosen time, or null for none. */
  selected: PracticeReminderTime | null;
  onChoose: (time: PracticeReminderTime | null) => void;
  /** Offer "Off" as well (You does; the practice sheet's offer has "Not now"). */
  withOff?: boolean;
  disabled?: boolean;
  testID?: string;
  /**
   * Offer "Pick a time" as well (roadmap D31): any time of day. Called on its
   * tap; the caller shows the picker. Chosen while `picking`, or while the
   * chosen time isn't one of the moments, and then it shows that time.
   */
  onPickTime?: () => void;
  picking?: boolean;
}

const same = (a: PracticeReminderTime | null, b: PracticeReminderTime) =>
  a !== null && a.hour === b.hour && a.minute === b.minute;

/**
 * The practice reminder's choices as moments in a day, each with its time
 * ("With coffee" over "8:00 AM"): a cue to attach the habit to, not just a
 * clock reading (roadmap step 89). A radio group; the selection is the
 * outline and a weight change as well as the tint (§0.5).
 */
export function MomentChips({
  selected,
  onChoose,
  withOff,
  disabled,
  testID = 'moment-chips',
  onPickTime,
  picking = false,
}: MomentChipsProps) {
  const custom =
    selected !== null && !PRACTICE_REMINDER_MOMENTS.some((m) => same(selected, m));
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Practice reminder" testID={testID}>
      {withOff && (
        <Chip
          title="Off"
          active={!picking && selected === null}
          disabled={disabled}
          half
          onPress={() => onChoose(null)}
          testID={`${testID}-off`}
        />
      )}
      {PRACTICE_REMINDER_MOMENTS.map((m) => (
        <Chip
          key={m.id}
          title={m.label}
          subtitle={reminderTimeLabel(m)}
          active={!picking && same(selected, m)}
          disabled={disabled}
          half={withOff}
          onPress={() => onChoose({ hour: m.hour, minute: m.minute })}
          testID={`${testID}-${m.id}`}
        />
      ))}
      {onPickTime && (
        <Chip
          title="Pick a time"
          subtitle={custom && selected ? reminderTimeLabel(selected) : undefined}
          active={picking || custom}
          disabled={disabled}
          half={withOff}
          onPress={onPickTime}
          testID={`${testID}-custom`}
        />
      )}
    </View>
  );
}

function Chip({
  title,
  subtitle,
  active,
  disabled,
  half,
  onPress,
  testID,
}: {
  title: string;
  subtitle?: string;
  active: boolean;
  disabled?: boolean;
  /** Two to a row, for four choices. */
  half?: boolean;
  onPress: () => void;
  testID: string;
}) {
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
        active && styles.chipActive,
        pressed && styles.chipPressed,
      ]}
      testID={testID}
    >
      <Text style={[styles.title, active && styles.titleActive]}>{title}</Text>
      {subtitle && <Text style={[styles.subtitle, active && styles.subtitleActive]}>{subtitle}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // Growing to share the row: three moments fit one line on a 375pt card;
  // with Off as well (You), `half` sets them two and two rather than ragged.
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
  chipActive: {
    backgroundColor: colors.brand50,
    borderColor: colors.brand600,
    borderWidth: 2,
    paddingHorizontal: space.sm - 1,
    paddingVertical: space.sm - 1,
  },
  chipPressed: { backgroundColor: colors.surfaceSunken },
  half: { flexBasis: '40%' },
  title: { ...type.subhead, color: colors.textPrimary, fontWeight: '500' },
  // brand800 on brand50: the text-safe brand ink in both appearances (D7).
  titleActive: { color: colors.brand800, fontWeight: '700' },
  subtitle: { ...type.caption, color: colors.textSecondary },
  subtitleActive: { color: colors.brand800 },
});
