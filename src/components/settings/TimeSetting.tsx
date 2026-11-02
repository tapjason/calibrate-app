import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  openPracticeTimeDialog,
  PracticeTimePicker,
} from '@/components/practice/PracticeTimePicker';
import { colors, radius, space, type } from '@/constants/theme';
import { reminderTimeLabel } from '@/notifications/practiceReminder';
import type { PracticeReminderTime } from '@/store/settingsStore';

interface TimeSettingProps {
  label: string;
  value: PracticeReminderTime;
  onChange: (time: PracticeReminderTime) => void;
  testID: string;
}

/**
 * A time of day in You (roadmap D38): the due-day reminder's and the digest's.
 * The native compact picker on iOS (itself a tappable time) and the browser's
 * time input on web, beside the label; Android opens its system dialog from a
 * button, as the practice reminder's time does.
 */
export function TimeSetting({ label, value, onChange, testID }: TimeSettingProps) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === 'android' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${reminderTimeLabel(value)}`}
          onPress={() => openPracticeTimeDialog(value, onChange)}
          style={styles.button}
          testID={`${testID}-button`}
        >
          <Text style={styles.buttonText}>{reminderTimeLabel(value)}</Text>
        </Pressable>
      ) : (
        <PracticeTimePicker
          value={value}
          onChange={onChange}
          label={label}
          testID={`${testID}-picker`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  label: { ...type.subhead, color: colors.textSecondary, flexShrink: 1 },
  button: {
    borderColor: colors.controlBorder,
    borderRadius: radius.sm,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  buttonText: { ...type.callout, color: colors.textPrimary },
});
