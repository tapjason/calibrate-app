import { useCallback, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { relativeDay } from '@/components/ui/dates';
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
  /** The inline picker is open (iOS inline calendar / web date input). */
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
 * is the choice, even before the date moves off a preset's.
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
  const pickerShown = picking || isCustomDate;
  // A tap on "Pick a date" asks the web field to open its calendar, once: the
  // picker takes the request as it appears, so an effect run twice or a
  // remount finds none (web playtest 2026-11-24: one tap in Edit opened it
  // twice). Never for an Edit that opens on a picked date.
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
            if (Platform.OS === 'android') {
              openDueDialog(value, onChange, earliest, latestDueFor());
              return;
            }
            if (!pickerShown) {
              openRequest.current = true;
              onPickerReveal?.();
            }
            onPickingChange(true);
          }}
          testID="due-pick"
          accessibilityRole="radio"
          accessibilityLabel="Pick a date"
          {...chosenProps('radio', pickerShown)}
          style={[chipStyles.chip, pickerShown && chipStyles.chipActive]}
        >
          <Text style={[chipStyles.chipText, pickerShown && chipStyles.chipTextActive]}>
            Pick a date
          </Text>
        </Pressable>
      </View>
      {/* Whenever "Pick a date" is the choice, its calendar is there: editing a
          prediction with a picked date showed the chip chosen and no field
          until a second tap (blind playtest 2026-11-01). */}
      {pickerShown && (
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
      {pickerShown && earliest.getTime() > Date.now() && (
        <Text style={styles.floorNote} testID="due-floor-note">
          Tomorrow at the earliest: an answer on the day it's logged isn't scored.
        </Text>
      )}
      {/* "Due in 3 days", "Due Nov 21 (Friday)" (the owner, 2026-11-24), as
          Save and every card say it. */}
      <Text style={styles.dateValue} testID="due-sentence">
        Due {relativeDay(new Date(value)).text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dateValue: { ...type.subhead, marginTop: space.sm, color: colors.textSecondary },
  floorNote: { ...type.footnote, marginTop: space.xs, color: colors.textSecondary },
});
