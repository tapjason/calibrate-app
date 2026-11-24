import Slider from '@react-native-community/slider';
import { useRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { adjustableProps } from '@/components/ui/adjustable';
import { Button } from '@/components/ui/Button';
import { haptics } from '@/components/ui/haptics';
import { colors, DISPLAY_MAX_SCALE, space, tabularNums, type } from '@/constants/theme';

interface ConfidenceControlProps {
  /**
   * Null until the person sets it (roadmap D13). Nothing is preset: a preset
   * can't be told apart from a choice, so an untouched Warmup answer read as
   * "75% sure" and an untouched Log save sat at a confidence nobody chose.
   */
  value: number | null;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** Visible and spoken label. */
  label?: string;
  /** Optional line under the readout, e.g. the Warmup's coin-flip note. */
  hint?: string;
  /** Prefix for every testID inside: `${prefix}-adjustable`, `-increment`, … */
  idPrefix?: string;
}

const STEP = 5;
/** Where an unset control rests and the first ±5 steps from (roadmap D49). */
const COIN_FLIP = 50;
/**
 * What the readout says before a number is set (the owner, 2026-11-23: a
 * default of "—%" "makes no sense in the UI"). Still empty, still no preset
 * (D13): Next and Save wait for a number.
 */
export const CONFIDENCE_EMPTY_READOUT = 'Slide to set';

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
  if (percent === 25) return 'about 1 time in\u00A04';
  if (percent === 75) return 'about 3 times in\u00A04';
  // Not "1 in 10" (Math.round(0.5) is 1) or "almost every time" (record
  // audit, 2026-11-09).
  if (percent === 5) return 'about 1 time in\u00A020';
  if (percent === 95) return 'about 19 times in\u00A020';
  // Halfway steps say both neighbours rather than rounding up: 85% is "8 or
  // 9 times in 10", not a flat 9 that overstates it.
  if (percent % 10 === 5 && percent > 5 && percent < 95) {
    const lo = Math.floor(percent / 10);
    return `${lo} or ${lo + 1} times in\u00A010`;
  }
  const inTen = Math.round(percent / 10);
  if (inTen === 0) return 'less than once in\u00A010';
  if (inTen === 10) return 'almost every time';
  // No-break spaces (D62): "about 9 times in" ended a line and "10" began
  // the next (blind playtest 2026-11-13d, run 1).
  return `about ${inTen} ${inTen === 1 ? 'time' : 'times'} in\u00A010`;
}

/**
 * The product's central input, given the weight it deserves (DESIGN_SYSTEM
 * §7.3): a large readout with its natural-frequency twin, a stepped slider
 * with a haptic detent per 5%, and the ±5 buttons kept for precision.
 *
 * It starts empty (the readout reads "Slide to set"; VoiceOver hears "not set")
 * with a grey thumb resting at the coin flip, 50%; the first drag, tap, touch
 * of the thumb or ±5 sets a number (roadmap D13, D49).
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
  // The number's first line, as iOS scales it (up to its cap): the readout's
  // slot keeps this height empty or set, so the row doesn't jump when the
  // first number arrives.
  const readoutLine = type.readout.lineHeight * Math.min(fontScale, DISPLAY_MAX_SCALE);
  // The gloss's one line, under the number, at the same cap.
  const glossLine = type.subhead.lineHeight * Math.min(fontScale, DISPLAY_MAX_SCALE);
  // Unset, the thumb rests in grey at the coin flip, 50%, on every screen,
  // and the first ±5 steps from it, as VoiceOver's first swipe does: 45% or
  // 55% (roadmap D49). Every screen runs 0–100 now; the Warm-up and practice
  // stopped at 50 until the owner's call of 2026-11-23 ("the minimum should
  // never be 50%"). Until 2026-11-09 it rested mid-range (D36), 75% on the
  // two-choice scales, so a coin flip cost five taps and 70% one, and a tester
  // took 70 "because it was one tap" (blind playtest 2026-11-09b, finding 5).
  // Any number is still one tap on the track.
  const middle = Math.min(max, Math.max(min, COIN_FLIP));
  const from = value ?? middle;
  // From the latest value, not the one this render drew: two taps landing
  // before the next render both stepped from it, and moved once (playtest
  // 2026-11-08b, finding 25).
  const step = (delta: number) => {
    const before = latest.current;
    set((latest.current ?? middle) + delta);
    // Said aloud (D62): a screen reader heard nothing after each ±5, so the
    // number changed silently (blind playtest 2026-11-13d, run 5, on the web
    // build). On iOS VoiceOver reaches the number through the adjustable,
    // which says its value; this covers anyone tapping the buttons.
    const now = latest.current;
    if (now !== null && now !== before) {
      AccessibilityInfo.announceForAccessibility(`${now}%, ${naturalFrequencyFor(now)}`);
    }
  };

  // Named with the visible characters, the longer wording as the hint: a
  // Voice Control user says what they see ("Tap plus 5"), and "Raise
  // confidence by 5" answered to nothing on screen (blind playtest
  // 2026-11-12, finding 2).
  const steppers = (
    <View style={[styles.steppers, !inlineSteppers && styles.steppersBelow]}>
      <Button
        label="−5"
        accessibilityLabel="−5"
        accessibilityHint="Lowers the confidence by 5"
        variant="secondary"
        onPress={() => step(-STEP)}
        testID={`${idPrefix}-decrement`}
      />
      <Button
        label="+5"
        accessibilityLabel="+5"
        accessibilityHint="Raises the confidence by 5"
        variant="secondary"
        onPress={() => step(STEP)}
        testID={`${idPrefix}-increment`}
      />
    </View>
  );

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
        {/* One block, one height in every state (owner, 2026-11-23): the number
            line over the gloss line, the gloss always on its own line, and
            empty the same two lines with the question where the number sits,
            so nothing below moves when the first number arrives or the gloss
            would have wrapped. */}
        <View
          style={[styles.readoutText, { height: readoutLine + glossLine }]}
          testID={`${idPrefix}-readout-block`}
        >
          <View style={[styles.readoutNumber, { height: readoutLine }]}>
            {unset ? (
              // A question in the number's place, not "—%" (the owner,
              // 2026-11-23), centred in the number's line like the ±5 beside it.
              <Text
                style={styles.readoutEmpty}
                testID={`${idPrefix}-readout`}
                maxFontSizeMultiplier={DISPLAY_MAX_SCALE}
              >
                {CONFIDENCE_EMPTY_READOUT}
              </Text>
            ) : (
              <Text
                style={styles.readout}
                testID={`${idPrefix}-readout`}
                maxFontSizeMultiplier={DISPLAY_MAX_SCALE}
              >
                {`${value}%`}
              </Text>
            )}
          </View>
          <View style={{ height: glossLine }}>
            {!unset && (
              <Text
                style={styles.frequency}
                testID={`${idPrefix}-gloss`}
                numberOfLines={1}
                maxFontSizeMultiplier={DISPLAY_MAX_SCALE}
              >
                {naturalFrequencyFor(value)}
              </Text>
            )}
          </View>
        </View>
        {/* Held level with the number's first line, so the frequency wrapping
            under it doesn't move them: a stylus user's +5 dropped about 10 px
            mid-tap (blind playtest 2026-11-13b, run 8). */}
        {inlineSteppers && (
          <View style={[styles.steppersInline, { minHeight: readoutLine }]}>{steppers}</View>
        )}
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
          minimumTrackTintColor={unset ? colors.hairline : colors.action}
          maximumTrackTintColor={colors.hairline}
          thumbTintColor={unset ? colors.controlBorder : colors.action}
          style={styles.slider}
        />
      </View>
      {!inlineSteppers && steppers}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.footnote, fontWeight: '500', color: colors.textSecondary },
  readoutRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.xs,
  },
  readoutText: { flex: 1 },
  // The number's line: its text sits at the start, or the question centred.
  readoutNumber: { justifyContent: 'center' },
  readout: {
    ...type.readout,
    ...tabularNums,
    color: colors.textPrimary,
  },
  readoutEmpty: { ...type.title3, color: colors.textSecondary },
  frequency: { ...type.subhead, color: colors.textSecondary },
  hint: { ...type.footnote, color: colors.textSecondary, marginBottom: space.xs },
  slider: { height: 40, width: '100%' },
  steppers: { flexDirection: 'row', gap: space.sm },
  steppersInline: { justifyContent: 'center' },
  steppersBelow: { marginTop: space.sm },
});
