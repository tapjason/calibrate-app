import Slider from '@react-native-community/slider';
import { useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { adjustableProps } from '@/components/ui/adjustable';
import { Button } from '@/components/ui/Button';
import { haptics } from '@/components/ui/haptics';
import { colors, DISPLAY_MAX_SCALE, radius, space, tabularNums, type } from '@/constants/theme';

interface ConfidenceControlProps {
  /**
   * Null until the person sets it (roadmap D13). Nothing is preset: a preset
   * can't be told apart from a choice, so an untouched Warmup answer read as
   * "75% sure" and an untouched Log save earned the integrity bonus.
   */
  value: number | null;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** Tint the 35–65% honest-uncertainty band (Log only; the Warmup starts at 50). */
  showIntegrityZone?: boolean;
  /** Visible and spoken label. */
  label?: string;
  /** Optional line under the readout, e.g. the Warmup's coin-flip note. */
  hint?: string;
  /** Prefix for every testID inside: `${prefix}-adjustable`, `-increment`, … */
  idPrefix?: string;
}

const STEP = 5;
const INTEGRITY_LOW = 35;
const INTEGRITY_HIGH = 65;
// Approximate half-width of the slider thumb, so the zone strip lines up with
// where the thumb's centre can actually travel.
const THUMB_INSET = 14;

/**
 * Below this width, or above this text scale, the ±5 buttons drop to their own
 * row: at 320pt "100%" and the buttons need 4pt more than the row has, and a
 * larger Dynamic Type readout needs more still.
 */
const INLINE_STEPPERS_MIN_WIDTH = 360;
const INLINE_STEPPERS_MAX_FONT_SCALE = 1.15;

/** "about 7 times in 10" — the natural-frequency twin of a percentage. */
export function naturalFrequencyFor(percent: number): string {
  if (percent === 0) return 'never';
  if (percent === 100) return 'every time';
  if (percent === 50) return 'a coin flip';
  if (percent === 25) return 'about 1 time in 4';
  if (percent === 75) return 'about 3 times in 4';
  // Halfway steps say both neighbours rather than rounding up: 85% is "8 or
  // 9 times in 10", not a flat 9 that overstates it.
  if (percent % 10 === 5 && percent > 5 && percent < 95) {
    const lo = Math.floor(percent / 10);
    return `${lo} or ${lo + 1} times in 10`;
  }
  const inTen = Math.round(percent / 10);
  if (inTen === 0) return 'less than once in 10';
  if (inTen === 10) return 'almost every time';
  return `about ${inTen} ${inTen === 1 ? 'time' : 'times'} in 10`;
}

/**
 * The product's central input, given the weight it deserves (DESIGN_SYSTEM
 * §7.3): a large readout with its natural-frequency twin, a stepped slider
 * with a haptic detent per 5%, and the ±5 buttons kept for precision.
 *
 * It starts empty ("—%, not set yet") with a grey thumb resting mid-range;
 * the first drag, tap, touch of the thumb or ±5 sets a number (roadmap D13).
 *
 * For VoiceOver the whole control is one `adjustable` element (swipe up/down,
 * hear the value), exactly as before the slider existed; the slider itself is
 * hidden from the accessibility tree so it isn't announced twice.
 */
export function ConfidenceControl({
  value,
  onChange,
  min = 0,
  max = 100,
  showIntegrityZone = false,
  label = 'Confidence',
  hint,
  idPrefix = 'confidence',
}: ConfidenceControlProps) {
  // The latest value, so a slide's change and its completion arriving in the
  // same tick don't both count as a step (two detents for one move).
  const latest = useRef(value);
  latest.current = value;
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next / STEP) * STEP));
    if (clamped !== latest.current) {
      latest.current = clamped;
      haptics.detent();
      onChange(clamped);
    }
  };
  const unset = value === null;
  const { width, fontScale } = useWindowDimensions();
  const inlineSteppers =
    width >= INLINE_STEPPERS_MIN_WIDTH && fontScale <= INLINE_STEPPERS_MAX_FONT_SCALE;
  // Unset, the thumb rests mid-range in grey and the ±5 buttons step from
  // there; the first touch, tap or swipe sets a real number.
  const middle = Math.round((min + max) / 2 / STEP) * STEP;
  const from = value ?? middle;

  const steppers = (
    <View style={[styles.steppers, !inlineSteppers && styles.steppersBelow]}>
      <Button
        label="−5"
        accessibilityLabel="Lower confidence by 5"
        variant="secondary"
        onPress={() => set(from - STEP)}
        testID={`${idPrefix}-decrement`}
      />
      <Button
        label="+5"
        accessibilityLabel="Raise confidence by 5"
        variant="secondary"
        onPress={() => set(from + STEP)}
        testID={`${idPrefix}-increment`}
      />
    </View>
  );

  const span = max - min;
  const zoneLeft = ((INTEGRITY_LOW - min) / span) * 100;
  const zoneWidth = ((INTEGRITY_HIGH - INTEGRITY_LOW) / span) * 100;
  const inZone = value !== null && value >= INTEGRITY_LOW && value <= INTEGRITY_HIGH;

  return (
    <View
      testID={`${idPrefix}-adjustable`}
      {...adjustableProps({
        label,
        value,
        min,
        max,
        step: STEP,
        onChange: set,
        start: middle,
      })}
    >
      <Text style={styles.label}>{label}</Text>
      {/* The steppers share the readout's row where it fits (2026-10-09): on
          their own row beneath the slider they pushed Next and Save below the
          fold on a 667pt phone. Narrower, or with larger text, they stay below. */}
      <View style={styles.readoutRow}>
        <View style={styles.readoutText}>
          <Text
            style={[styles.readout, unset && styles.readoutUnset]}
            testID={`${idPrefix}-readout`}
            maxFontSizeMultiplier={DISPLAY_MAX_SCALE}
          >
            {unset ? '—%' : `${value}%`}
          </Text>
          <Text style={styles.frequency}>{unset ? 'not set yet' : naturalFrequencyFor(value)}</Text>
        </View>
        {inlineSteppers && steppers}
      </View>
      {hint && <Text style={styles.hint}>{hint}</Text>}

      <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Slider
          testID={`${idPrefix}-slider`}
          value={from}
          minimumValue={min}
          maximumValue={max}
          step={STEP}
          onValueChange={set}
          // Touching the resting thumb without moving it is still a choice.
          onSlidingComplete={(v) => {
            if (latest.current === null) set(v);
          }}
          tapToSeek
          minimumTrackTintColor={unset ? colors.hairline : colors.brand600}
          maximumTrackTintColor={colors.hairline}
          thumbTintColor={unset ? colors.controlBorder : colors.brand600}
          style={styles.slider}
        />
        {showIntegrityZone && (
          <View style={styles.zoneTrack}>
            <View
              testID="integrity-zone"
              style={[
                styles.zone,
                inZone && styles.zoneActive,
                { left: `${zoneLeft}%`, width: `${zoneWidth}%` },
              ]}
            />
          </View>
        )}
      </View>
      {!inlineSteppers && steppers}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.footnote, fontWeight: '500', color: colors.textSecondary },
  readoutRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.xs,
  },
  readoutText: {
    alignItems: 'baseline',
    columnGap: space.md,
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  readout: {
    ...type.readout,
    ...tabularNums,
    color: colors.textPrimary,
  },
  // Same size, so setting a number doesn't shift the layout; tertiary ink
  // (4.91:1) says nothing is there yet.
  readoutUnset: { color: colors.textTertiary },
  frequency: { ...type.subhead, color: colors.textSecondary },
  hint: { ...type.footnote, color: colors.textSecondary, marginBottom: space.xs },
  slider: { height: 40, width: '100%' },
  // The band's meaning is spelled out by the integrity chip beneath the
  // control, so the band itself stays wordless.
  zoneTrack: { height: 6, marginBottom: 4, marginHorizontal: THUMB_INSET },
  zone: {
    backgroundColor: colors.brand100,
    borderRadius: radius.pill,
    height: 6,
    position: 'absolute',
  },
  zoneActive: { backgroundColor: colors.brand400 },
  steppers: { flexDirection: 'row', gap: space.sm },
  steppersBelow: { marginTop: space.sm },
});
