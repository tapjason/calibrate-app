import { createElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { colors, FONT_FAMILY, radius, space, type } from '@/constants/theme';
import type { PracticeReminderTime } from '@/store/settingsStore';

interface PracticeTimePickerProps {
  /** The time shown to start from. */
  value: PracticeReminderTime;
  onChange: (time: PracticeReminderTime) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "08:30" for an <input type="time">. */
export function toTimeInputValue(t: PracticeReminderTime): string {
  return `${pad(t.hour)}:${pad(t.minute)}`;
}

/** "08:30" → { hour: 8, minute: 30 }, or null for anything else. */
export function parseTimeInputValue(value: string): PracticeReminderTime | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * "Pick a time" for the practice reminder (roadmap D31): any time of day, for
 * anyone whose day doesn't fit coffee, lunch or dinner (a tester on shifts).
 * The native compact time picker on iOS, the browser's time input on web;
 * Android opens the system dialog from the chip (openPracticeTimeDialog).
 */
export function PracticeTimePicker({ value, onChange }: PracticeTimePickerProps) {
  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'time',
      value: toTimeInputValue(value),
      'aria-label': 'Practice reminder time',
      'data-testid': 'practice-time-picker',
      onChange: (e: { target: { value: string } }) => {
        const t = parseTimeInputValue(e.target.value);
        if (t) onChange(t);
      },
      style: {
        fontFamily: FONT_FAMILY,
        fontSize: type.callout.fontSize, // ≥ 16px or iOS Safari zooms on focus
        padding: '10px 12px',
        borderRadius: radius.sm,
        border: `1px solid ${colors.controlBorder}`,
        background: colors.surface,
        color: colors.textPrimary,
        colorScheme: 'light dark',
        alignSelf: 'flex-start',
      },
    });
  }
  if (Platform.OS === 'android') return null;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const picker = require('@react-native-community/datetimepicker') as typeof import('@react-native-community/datetimepicker');
  const DateTimePicker = picker.default;
  const at = new Date();
  at.setHours(value.hour, value.minute, 0, 0);
  return (
    <View style={styles.ios} testID="practice-time-picker">
      <DateTimePicker
        value={at}
        mode="time"
        display="compact"
        accentColor={colors.brand600}
        onChange={(_e, date) => {
          if (date) onChange({ hour: date.getHours(), minute: date.getMinutes() });
        }}
        accessibilityLabel="Practice reminder time"
      />
    </View>
  );
}

/** Android: the system time dialog, opened from the chip's tap, never in render. */
export function openPracticeTimeDialog(
  value: PracticeReminderTime,
  onChange: (time: PracticeReminderTime) => void,
): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const picker = require('@react-native-community/datetimepicker') as typeof import('@react-native-community/datetimepicker');
  const at = new Date();
  at.setHours(value.hour, value.minute, 0, 0);
  picker.DateTimePickerAndroid.open({
    value: at,
    mode: 'time',
    onChange: (_e, date) => {
      if (date) onChange({ hour: date.getHours(), minute: date.getMinutes() });
    },
  });
}

const styles = StyleSheet.create({
  ios: { alignSelf: 'flex-start', marginTop: space.sm },
});
