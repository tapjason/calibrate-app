import Slider from '@react-native-community/slider';
import { StyleSheet, Text, View } from 'react-native';

import { adjustableProps } from '@/components/ui/adjustable';
import { Button } from '@/components/ui/Button';
import { haptics } from '@/components/ui/haptics';
import { colors, radius, roundedFamily, space, tabularNums, type } from '@/constants/theme';

interface ConfidenceControlProps {
  value: number;
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

/** "about 7 times in 10" — the natural-frequency twin of a percentage. */
export function naturalFrequencyFor(percent: number): string {
  if (percent === 0) return 'never';
  if (percent === 100) return 'every time';
  if (percent === 50) return 'a coin flip';
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
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next / STEP) * STEP));
    if (clamped !== value) {
      haptics.detent();
      onChange(clamped);
    }
  };

  const span = max - min;
  const zoneLeft = ((INTEGRITY_LOW - min) / span) * 100;
  const zoneWidth = ((INTEGRITY_HIGH - INTEGRITY_LOW) / span) * 100;
  const inZone = value >= INTEGRITY_LOW && value <= INTEGRITY_HIGH;

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
      })}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readoutRow}>
        <Text style={styles.readout} testID={`${idPrefix}-readout`}>
          {value}%
        </Text>
        <Text style={styles.frequency}>{naturalFrequencyFor(value)}</Text>
      </View>
      {hint && <Text style={styles.hint}>{hint}</Text>}

      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Slider
          testID={`${idPrefix}-slider`}
          value={value}
          minimumValue={min}
          maximumValue={max}
          step={STEP}
          onValueChange={set}
          minimumTrackTintColor={colors.brand600}
          maximumTrackTintColor={colors.hairline}
          thumbTintColor={colors.brand600}
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
        {showIntegrityZone && (
          <View style={styles.zoneLabelTrack}>
            <Text
              style={[styles.zoneLabel, { left: `${zoneLeft}%`, width: `${zoneWidth}%` }]}
            >
              honest uncertainty
            </Text>
          </View>
        )}
      </View>

      <View style={styles.steppers}>
        <Button
          label="−5"
          accessibilityLabel="Lower confidence by 5"
          variant="secondary"
          onPress={() => set(value - STEP)}
          testID={`${idPrefix}-decrement`}
        />
        <Button
          label="+5"
          accessibilityLabel="Raise confidence by 5"
          variant="secondary"
          onPress={() => set(value + STEP)}
          testID={`${idPrefix}-increment`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.footnote, fontWeight: '500', color: colors.textSecondary },
  readoutRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: space.md,
    marginBottom: space.xs,
  },
  readout: {
    ...tabularNums,
    color: colors.textPrimary,
    fontFamily: roundedFamily,
    fontSize: 48,
    fontWeight: '700',
    lineHeight: 56,
  },
  frequency: { ...type.subhead, color: colors.textSecondary },
  hint: { ...type.footnote, color: colors.textSecondary, marginBottom: space.xs },
  slider: { height: 40, width: '100%' },
  zoneTrack: { height: 6, marginHorizontal: THUMB_INSET },
  zone: {
    backgroundColor: colors.brand100,
    borderRadius: radius.pill,
    height: 6,
    position: 'absolute',
  },
  zoneActive: { backgroundColor: colors.brand400 },
  zoneLabelTrack: { height: 18, marginHorizontal: THUMB_INSET, marginTop: 2 },
  zoneLabel: {
    ...type.caption,
    color: colors.integrityText,
    position: 'absolute',
    textAlign: 'center',
  },
  steppers: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
});
