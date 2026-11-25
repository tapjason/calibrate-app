import { useCallback, useRef } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { dueDay } from '@/components/ui/dates';
import { chipStyles } from '@/components/prediction/CategoryChips';
import { DuePicker, openDueDialog } from '@/components/prediction/DuePicker';
import { noonInDays } from '@/components/prediction/logAgain';
import { chosenProps } from '@/components/ui/chosen';
import { colors, space, type } from '@/constants/theme';
import { earliestDueFor, latestDueFor } from '@/store/predictionStore';

export interface DuePreset {
  id: 'tomorrow' | 'week' | 'month';
  label: string;
  iso: string;
}

/**
 * The three preset due dates, each at local noon (noonInDays, shared with
 * "Log it again"). Words, not "+1 week", which reads as arithmetic
 * (DESIGN_SYSTEM §7.12). Callers freeze these at mount: rebuilt every render,
 * the ISO strings would move each tick and no chip would read as chosen.
 */
export function datePresets(now: Date = new Date()): DuePreset[] {
  return [
    { id: 'tomorrow', label: 'Tomorrow', iso: noonInDays(1, now) },
    { id: 'week', label: 'In a week', iso: noonInDays(7, now) },
    { id: 'month', label: 'In a month', iso: noonInDays(30, now) },
  ];
}

interface DueDateChipsProps {
  presets: readonly DuePreset[];
  value: string;
  /**
   * The inline picker is open (iOS inline calendar / web date input). Only a
   * tap on "Pick a date" opens it: a picked date carried in shows folded.
   */
  picking: boolean;
  onChange: (iso: string) => void;
  onPickingChange: (picking: boolean) => void;
  /**
   * The earliest day "Pick a date" offers. Defaults to tomorrow, for a
   * prediction being logged now: one answered the day it was logged isn't
   * scored (roadmap D41). Edit passes the day after it was logged.
   */
  earliest?: Date;
  /**
   * "Pick a date" was tapped and the picker is about to appear (not when it
   * already shows): the form brings it into view once it's laid out.
   */
  onPickerReveal?: () => void;
}

/**
 * The due-date chips, "Pick a date" and the date as a sentence (DESIGN_SYSTEM
 * §7.12). Shared by Log and an open prediction's Edit (§7.23). One chip is
 * chosen at a time (roadmap step 93): while the picker is open, "Pick a date"
 * is the choice, even before the date moves off a preset's; a date no preset
 * holds keeps it chosen with the calendar folded.
 */
export function DueDateChips({
  presets,
  value,
  picking,
  onChange,
  onPickingChange,
  earliest = earliestDueFor(new Date()),
  onPickerReveal,
}: DueDateChipsProps) {
  const isCustomDate = !presets.some((p) => p.iso === value);
  const presetChosen = (iso: string) => !picking && value === iso;
  // "Pick a date" is the choice for a date no preset holds, but its calendar
  // shows only after a tap on it (review 2026-11-25): an Edit opening on a
  // picked date showed the whole month grid at once and pushed Save changes
  // off the sheet. The date sentence below says the day meanwhile.
  const pickChosen = picking || isCustomDate;
  // A tap on "Pick a date" asks the web field to open its calendar, once: the
  // picker takes the request as it appears, so an effect run twice or a
  // remount finds none (web playtest 2026-11-24: one tap in Edit opened it
  // twice).
  const openRequest = useRef(false);
  const takeOpenRequest = useCallback(() => {
    const asked = openRequest.current;
    openRequest.current = false;
    return asked;
  }, []);
  return (
    <View>
      {/* One group, like the category chips, so assistive tech hears "1 of 4". */}
      <View style={chipStyles.row} accessibilityRole="radiogroup" accessibilityLabel="Due date">
        {presets.map((preset) => (
          <Pressable
            key={preset.id}
            onPress={() => {
              openRequest.current = false;
              onChange(preset.iso);
              onPickingChange(false);
            }}
            testID={`due-${preset.id}`}
            accessibilityRole="radio"
            accessibilityLabel={`Due ${preset.label.toLowerCase()}`}
            {...chosenProps('radio', presetChosen(preset.iso))}
            style={[chipStyles.chip, presetChosen(preset.iso) && chipStyles.chipActive]}
          >
            <Text style={[chipStyles.chipText, presetChosen(preset.iso) && chipStyles.chipTextActive]}>
              {preset.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => {
            // The keyboard down first, as a category tap does on Log: the
            // calendar opens below the title field, behind it otherwise.
            Keyboard.dismiss();
            if (Platform.OS === 'android') {
              openDueDialog(value, onChange, earliest, latestDueFor());
              return;
            }
            if (!picking) {
              openRequest.current = true;
              onPickerReveal?.();
            }
            onPickingChange(true);
          }}
          testID="due-pick"
          accessibilityRole="radio"
          accessibilityLabel="Pick a date"
          {...chosenProps('radio', pickChosen)}
          style={[chipStyles.chip, pickChosen && chipStyles.chipActive]}
        >
          <Text style={[chipStyles.chipText, pickChosen && chipStyles.chipTextActive]}>
            Pick a date
          </Text>
        </Pressable>
      </View>
      {/* Only once "Pick a date" is tapped (review 2026-11-25; D78: the full
          calendar at once, when tapped). A picked date carried in shows the
          chip chosen and the sentence, and one tap on the chip opens it. */}
      {picking && (
        <DuePicker
          value={value}
          onChange={onChange}
          earliest={earliest}
          latest={latestDueFor()}
          takeOpenRequest={takeOpenRequest}
        />
      )}
      {/* Why today can't be picked, where it can't (D41): a typed date was
          moved to tomorrow without a word (blind playtest 2026-11-05). Not
          when editing one logged earlier, whose earliest day is past. */}
      {picking && earliest.getTime() > Date.now() && (
        <Text style={styles.floorNote} testID="due-floor-note">
          Tomorrow at the earliest: an answer on the day it's logged isn't scored.
        </Text>
      )}
      {/* "Due in 3 days", "Due Nov 21 (Friday)" (the owner, 2026-11-24), as
          Save and every card say it; "Due today by 11:59 PM" when an edit
          leaves it today (D80). */}
      <Text style={styles.dateValue} testID="due-sentence">
        Due {dueDay(new Date(value)).text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dateValue: { ...type.subhead, marginTop: space.sm, color: colors.textSecondary },
  floorNote: { ...type.footnote, marginTop: space.xs, color: colors.textSecondary },
});
