import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { chipStyles } from '@/components/prediction/CategoryChips';
import { DuePicker, openDueDialog } from '@/components/prediction/DuePicker';
import { noonInDays } from '@/components/prediction/logAgain';
import { chosenProps } from '@/components/ui/chosen';
import { colors, space, type } from '@/constants/theme';

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
  /** The inline picker is open (iOS compact / web date input). */
  picking: boolean;
  onChange: (iso: string) => void;
  onPickingChange: (picking: boolean) => void;
}

/**
 * The due-date chips, "Pick a date" and the date as a sentence (DESIGN_SYSTEM
 * §7.12). Shared by Log and an open prediction's Edit (§7.23). One chip is
 * chosen at a time (roadmap step 93): while the picker is open, "Pick a date"
 * is the choice, even before the date moves off a preset's.
 */
export function DueDateChips({ presets, value, picking, onChange, onPickingChange }: DueDateChipsProps) {
  const isCustomDate = !presets.some((p) => p.iso === value);
  const presetChosen = (iso: string) => !picking && value === iso;
  return (
    <View>
      <View style={chipStyles.row}>
        {presets.map((preset) => (
          <Pressable
            key={preset.id}
            onPress={() => {
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
            if (Platform.OS === 'android') openDueDialog(value, onChange);
            else onPickingChange(true);
          }}
          testID="due-pick"
          accessibilityRole="radio"
          accessibilityLabel="Pick a date"
          {...chosenProps('radio', isCustomDate || picking)}
          style={[chipStyles.chip, (isCustomDate || picking) && chipStyles.chipActive]}
        >
          <Text style={[chipStyles.chipText, (isCustomDate || picking) && chipStyles.chipTextActive]}>
            Pick a date
          </Text>
        </Pressable>
      </View>
      {picking && <DuePicker value={value} onChange={onChange} />}
      <Text style={styles.dateValue} testID="due-sentence">
        Due{' '}
        {new Date(value).toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
        })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dateValue: { ...type.subhead, marginTop: space.sm, color: colors.textSecondary },
});
