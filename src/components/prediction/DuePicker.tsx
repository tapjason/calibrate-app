import { createElement, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { colors, FONT_FAMILY, radius, space, type } from '@/constants/theme';

interface DuePickerProps {
  /** Current due date, ISO. */
  value: string;
  /** Called with the chosen day, anchored at local noon like the presets. */
  onChange: (iso: string) => void;
  /**
   * The earliest day it offers, at local midnight: the day after the
   * prediction was logged (roadmap D41), never before today.
   */
  earliest: Date;
  /**
   * The latest day it offers, at local midnight: two years on (playtest
   * 2026-11-08, which picked 12/31/9999).
   */
  latest: Date;
  /**
   * Takes the open request a tap on "Pick a date" left, true once per tap
   * (DueDateChips): on web the browser's own calendar then opens at once, as
   * the iPhone's inline one shows at once. Never for an Edit that opens on a
   * picked date.
   */
  takeOpenRequest?: () => boolean;
}

/** The parts of a web date field this uses; `showPicker` is missing in older browsers. */
interface WebDateInput {
  showPicker?: () => void;
}

/**
 * Opens a web date field's own calendar, where the browser can. A browser
 * without `showPicker`, or one that refuses it (no user activation left, a
 * cross-origin frame), leaves the field as it is: one more tap opens it.
 * Exported for tests.
 */
export function openWebPicker(input: WebDateInput | null): void {
  if (!input || typeof input.showPicker !== 'function') return;
  try {
    input.showPicker();
  } catch {
    // Refused: the field stays, and a tap opens it.
  }
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

/**
 * A picked day held between `earliest` and `latest`. A web date field's `min`
 * and `max` only grey out its calendar: a date typed by keyboard gets past
 * both, today, a year like 1906 (blind playtest 2026-11-04) or 9999
 * (2026-11-08). Exported for tests.
 */
export function clampPicked(picked: Date, earliest: Date, latest: Date): Date {
  if (picked < earliest) return earliest;
  return picked > latest ? latest : picked;
}

/**
 * "Pick a date" for the Log form (DESIGN_SYSTEM §7.12): the iPhone's inline
 * calendar, shown whole as soon as "Pick a date" is chosen (the owner,
 * 2026-11-24: the compact picker's small date button took a second tap), the
 * system dialog on Android, and the browser's own date input on web, its
 * calendar opened at once after the tap. Earliest choice is `earliest`: never
 * the past, where the reminder would fire at once, and never the day it was
 * logged, since an answer that day isn't scored (roadmap D41).
 */
export function DuePicker({ value, onChange, earliest, latest, takeOpenRequest }: DuePickerProps) {
  const webInput = useRef<WebDateInput | null>(null);
  // As it appears, and only if a tap asked. The request is taken, not read,
  // so this effect run a second time (one tap in Edit opened the calendar
  // twice, web playtest 2026-11-24), a remount or a re-render (a day picked)
  // finds none. Taken on every platform, so none is left lying.
  useEffect(() => {
    const asked = takeOpenRequest?.() ?? false;
    if (asked && Platform.OS === 'web') openWebPicker(webInput.current);
    // Once per appearance: a new function from the parent isn't a new tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (Platform.OS === 'web') {
    // react-native-web renders to the DOM, so a real <input type="date"> is
    // the most accessible picker a browser offers.
    return createElement('input', {
      type: 'date',
      ref: webInput,
      value: toDateInputValue(value),
      min: toDateInputValue(earliest.toISOString()),
      max: toDateInputValue(latest.toISOString()),
      'aria-label': 'Due date',
      'data-testid': 'due-picker',
      onChange: (e: { target: { value: string } }) => {
        const [y, m, d] = e.target.value.split('-').map(Number);
        if (!(y && m && d)) return;
        const day = clampPicked(new Date(y, m - 1, d), earliest, latest);
        onChange(localNoonIso(day.getFullYear(), day.getMonth(), day.getDate()));
      },
      style: {
        // The face by name: 'inherit' found no family above it and drew the
        // date in the browser's serif (roadmap step 92).
        fontFamily: FONT_FAMILY,
        fontSize: type.callout.fontSize, // ≥ 16px or iOS Safari zooms on focus
        padding: '10px 12px',
        borderRadius: radius.sm,
        border: `1px solid ${colors.controlBorder}`,
        background: colors.surface,
        color: colors.textPrimary,
        // The browser's own parts (the calendar icon, the popup) follow the
        // appearance too; without it the icon stayed black on the dark surface.
        colorScheme: 'light dark',
        alignSelf: 'flex-start',
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const picker = require('@react-native-community/datetimepicker') as typeof import('@react-native-community/datetimepicker');
  const pick = (date?: Date) => {
    if (date) onChange(localNoonIso(date.getFullYear(), date.getMonth(), date.getDate()));
  };

  // Android's picker is a dialog, opened imperatively by openDueDialog();
  // there is nothing to render inline.
  if (Platform.OS === 'android') return null;

  const DateTimePicker = picker.default;
  // Inline: the month's calendar in the form, at the size iOS gives it (the
  // library sets the view's size from the picker's own, iOS 14 and later).
  return (
    <View style={styles.ios} testID="due-picker">
      <DateTimePicker
        value={new Date(value)}
        mode="date"
        display="inline"
        minimumDate={earliest}
        maximumDate={latest}
        accentColor={colors.action}
        // No themeVariant: it was pinned to light while the app was, and the
        // picker now follows the phone like the rest of the sheet (step 92).
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
export function openDueDialog(
  value: string,
  onChange: (iso: string) => void,
  earliest: Date,
  latest: Date,
): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const picker = require('@react-native-community/datetimepicker') as typeof import('@react-native-community/datetimepicker');
  picker.DateTimePickerAndroid.open({
    value: new Date(value),
    mode: 'date',
    minimumDate: earliest,
    maximumDate: latest,
    onChange: (_e, date) => {
      if (date) onChange(localNoonIso(date.getFullYear(), date.getMonth(), date.getDate()));
    },
  });
}

const styles = StyleSheet.create({
  // Centred: the calendar's width is iOS's own, and on a narrow phone any
  // overflow falls evenly into the form's side margins.
  ios: { alignSelf: 'center', marginTop: space.sm },
});
