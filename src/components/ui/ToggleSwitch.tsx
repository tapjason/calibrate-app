import { Switch, type SwitchProps } from 'react-native';

import { colors } from '@/constants/theme';

type ToggleSwitchProps = Omit<
  SwitchProps,
  'trackColor' | 'thumbColor' | 'ios_backgroundColor'
>;

/**
 * The app's one switch, so every switch looks and lines up the same. Ink
 * when on (the brand has no hue, D33), with the thumb in the opposite ink so
 * it reads on the track: white in light mode, near-black in dark, where the
 * track turns light. Off, a 3:1 grey track still reads as a control
 * (DESIGN_SYSTEM §2.2 controlBorder).
 *
 * On iOS 26 the switch is 63 × 28pt and is drawn exactly in the frame React
 * Native measures (checked on the device, 2026-11-07), so centring it is the
 * row's job.
 */
export function ToggleSwitch(props: ToggleSwitchProps) {
  return (
    <Switch
      {...props}
      trackColor={{ true: colors.action, false: colors.controlBorder }}
      thumbColor={colors.onAction}
      ios_backgroundColor={colors.controlBorder}
      // react-native-web's name for the thumb when on.
      {...{ activeThumbColor: colors.onAction }}
    />
  );
}
