import { Platform, type AccessibilityState } from 'react-native';

/**
 * What kind of choice a control is:
 * - `radio`: one of a group (a category, a due date, a plan, a Warmup answer);
 * - `tab`: one of a segmented row that switches what's shown;
 * - `toggle`: a button that stays down while chosen (History's filters, a card theme);
 * - `checkbox`: on or off on its own (a category shown on the card).
 */
export type ChoiceKind = 'radio' | 'tab' | 'toggle' | 'checkbox';

export interface ChosenProps {
  accessibilityState: AccessibilityState;
  'aria-checked'?: boolean;
  'aria-selected'?: boolean;
  /** Not in React Native's types; react-native-web maps it to the attribute. */
  'aria-pressed'?: boolean;
  'aria-disabled'?: boolean;
}

/**
 * Whether a control is the chosen one, said on every platform (roadmap step
 * 96). iOS and Android read `accessibilityState`; react-native-web ignores it
 * and maps only the aria-* props, so on the web build a screen reader heard
 * every chip in a group as unchosen, the picked one included. Web gets the
 * attribute its role expects as well: aria-checked for a radio or a checkbox,
 * aria-selected for a tab, aria-pressed for a toggle button.
 *
 * Spread onto the Pressable, in place of `accessibilityState`.
 */
export function chosenProps(kind: ChoiceKind, chosen: boolean, disabled?: boolean): ChosenProps {
  const state: AccessibilityState = kind === 'checkbox' ? { checked: chosen } : { selected: chosen };
  if (disabled !== undefined) state.disabled = disabled;
  if (Platform.OS !== 'web') return { accessibilityState: state };

  const props: ChosenProps = { accessibilityState: state };
  if (kind === 'tab') props['aria-selected'] = chosen;
  else if (kind === 'toggle') props['aria-pressed'] = chosen;
  else props['aria-checked'] = chosen;
  if (disabled) props['aria-disabled'] = true;
  return props;
}
