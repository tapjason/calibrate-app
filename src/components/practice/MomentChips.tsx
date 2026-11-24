import { StyleSheet, View } from 'react-native';

import { OptionChip } from '@/components/ui/OptionChip';
import { space } from '@/constants/theme';
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
  /**
   * The chips sit on a `surfaceSunken` card (the offer under a finished
   * practice): an unchosen chip's edge takes `textTertiary`, since
   * `controlBorder` is 2.93:1 on the sunken fill in light (step 195).
   */
  onSunken?: boolean;
}

const same = (a: PracticeReminderTime | null, b: PracticeReminderTime) =>
  a !== null && a.hour === b.hour && a.minute === b.minute;

/**
 * The practice reminder's choices as moments in a day, each with its time
 * ("With coffee" over "8:00 AM"): a cue to attach the habit to, not just a
 * clock reading (roadmap step 89). A radio group of `OptionChip`s; the
 * selection is the outline and a weight change as well as the tint (§0.5).
 */
export function MomentChips({
  selected,
  onChoose,
  withOff,
  disabled,
  testID = 'moment-chips',
  onPickTime,
  picking = false,
  onSunken = false,
}: MomentChipsProps) {
  const custom =
    selected !== null && !PRACTICE_REMINDER_MOMENTS.some((m) => same(selected, m));
  // Once a time is chosen here, the chip says so ("Your time" over "6:45 AM",
  // as the moments read), not "Pick a time" still: a tester took that as the
  // choice not having stuck (blind playtest 2026-11-01).
  const ownTime = (custom || picking) && selected !== null ? selected : null;
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Practice reminder" testID={testID}>
      {withOff && (
        <OptionChip
          title="Off"
          active={!picking && selected === null}
          disabled={disabled}
          onSunken={onSunken}
          half
          onPress={() => onChoose(null)}
          testID={`${testID}-off`}
        />
      )}
      {PRACTICE_REMINDER_MOMENTS.map((m) => (
        <OptionChip
          key={m.id}
          title={m.label}
          subtitle={reminderTimeLabel(m)}
          active={!picking && same(selected, m)}
          disabled={disabled}
          onSunken={onSunken}
          half={withOff}
          onPress={() => onChoose({ hour: m.hour, minute: m.minute })}
          testID={`${testID}-${m.id}`}
        />
      ))}
      {onPickTime && (
        <OptionChip
          title={ownTime ? 'Your time' : 'Pick a time'}
          subtitle={ownTime ? reminderTimeLabel(ownTime) : undefined}
          active={picking || custom}
          disabled={disabled}
          onSunken={onSunken}
          half={withOff}
          onPress={onPickTime}
          testID={`${testID}-custom`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
