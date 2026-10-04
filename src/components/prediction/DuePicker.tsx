import { createElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { colors, radius, space, type } from '@/constants/theme';

interface DuePickerProps {
  /** Current due date, ISO. */
  value: string;
  /** Called with the chosen day, anchored at local noon like the presets. */
  onChange: (iso: string) => void;
}

/** Local noon on the given calendar day: same UTC date in every zone ±12h. */
export function localNoonIso(year: number, month: number, day: number): string {
  return new Date(year, month, day, 12, 0, 0, 0).toISOString();
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function todayInputValue(): string {
  return toDateInputValue(new Date().toISOString());
}

/**
 * "Pick a date" for the Log form (DESIGN_SYSTEM §7.12): the native compact
 * picker on iOS, the system dialog on Android, and the browser's own date
 * input on web. Earliest choice is today — a prediction due in the past
 * would fire its reminder immediately.
 */
export function DuePicker({ value, onChange }: DuePickerProps) {
  if (Platform.OS === 'web') {
    // react-native-web renders to the DOM, so a real <input type="date"> is
    // the most accessible picker a browser offers.
    return createElement('input', {
      type: 'date',
      value: toDateInputValue(value),
      min: todayInputValue(),
      'aria-label': 'Due date',
      'data-testid': 'due-picker',
      onChange: (e: { target: { value: string } }) => {
        const [y, m, d] = e.target.value.split('-').map(Number);
        if (y && m && d) onChange(localNoonIso(y, m - 1, d));
      },
      style: {
        font: 'inherit',
        fontSize: type.callout.fontSize, // ≥ 16px or iOS Safari zooms on focus
        padding: '10px 12px',
        borderRadius: radius.sm,
        border: `1px solid ${colors.controlBorder}`,
        background: colors.surface,
        color: colors.textPrimary,
        alignSelf: 'flex-start',
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const picker = require('@react-native-community/datetimepicker') as typeof import('@react-native-community/datetimepicker');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pick = (date?: Date) => {
    if (date) onChange(localNoonIso(date.getFullYear(), date.getMonth(), date.getDate()));
  };

  // Android's picker is a dialog, opened imperatively by openDueDialog();
  // there is nothing to render inline.
  if (Platform.OS === 'android') return null;

  const DateTimePicker = picker.default;
  return (
    <View style={styles.ios} testID="due-picker">
      <DateTimePicker
        value={new Date(value)}
        mode="date"
        display="compact"
        minimumDate={today}
        accentColor={colors.brand600}
        themeVariant="light"
        onChange={(_e, date) => pick(date)}
        accessibilityLabel="Due date"
      />
    </View>
  );
}

/**
 * Android: open the system date dialog. Called from the "Pick a date" tap,
 * never during render, so a re-render can't reopen it.
 */
export function openDueDialog(value: string, onChange: (iso: string) => void): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const picker = require('@react-native-community/datetimepicker') as typeof import('@react-native-community/datetimepicker');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  picker.DateTimePickerAndroid.open({
    value: new Date(value),
    mode: 'date',
    minimumDate: today,
    onChange: (_e, date) => {
      if (date) onChange(localNoonIso(date.getFullYear(), date.getMonth(), date.getDate()));
    },
  });
}

const styles = StyleSheet.create({
  ios: { alignSelf: 'flex-start', marginTop: space.xs },
});
