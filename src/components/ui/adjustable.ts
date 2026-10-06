import type { AccessibilityActionEvent, ViewProps } from 'react-native';

/**
 * Accessibility props that make a stepped value (the confidence ±5 control)
 * a single VoiceOver/TalkBack "adjustable" element: swipe up or down to change
 * it, and hear the new value. Without this, a screen-reader user meets two
 * buttons called "−5" and "+5" and a number read nowhere near them.
 *
 * Spread onto the View that wraps the label and the buttons.
 */
export function adjustableProps({
  label,
  value,
  min,
  max,
  step,
  onChange,
  start,
}: {
  label: string;
  /** Null while nothing is set: VoiceOver hears "not set", and a swipe starts from `start`. */
  value: number | null;
  /** Where the first swipe steps from while `value` is null. */
  start?: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
}): Pick<
  ViewProps,
  | 'accessible'
  | 'accessibilityRole'
  | 'accessibilityLabel'
  | 'accessibilityValue'
  | 'accessibilityActions'
  | 'onAccessibilityAction'
> {
  const from = value ?? start ?? Math.round((min + max) / 2);
  return {
    accessible: true,
    accessibilityRole: 'adjustable',
    accessibilityLabel: label,
    accessibilityValue:
      value === null ? { min, max, text: 'not set' } : { min, max, now: value, text: `${value}%` },
    accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
    onAccessibilityAction: (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, from + step));
      if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, from - step));
    },
  };
}
