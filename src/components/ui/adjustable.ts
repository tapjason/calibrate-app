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
}: {
  label: string;
  value: number;
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
  return {
    accessible: true,
    accessibilityRole: 'adjustable',
    accessibilityLabel: label,
    accessibilityValue: { min, max, now: value, text: `${value}%` },
    accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
    onAccessibilityAction: (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + step));
      if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - step));
    },
  };
}
