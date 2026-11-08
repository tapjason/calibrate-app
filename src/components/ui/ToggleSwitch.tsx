import { StyleSheet, Switch, View, type SwitchProps } from 'react-native';

import { colors } from '@/constants/theme';

/**
 * Development builds only: outlines the frame React Native gives each switch.
 * On the first device run (2026-11-07, iOS 26) every switch sat above its
 * row's centre line, in Categories and You alike, even boxed and centred. The
 * frame is measured from a default UISwitch, and UIKit draws the switch from
 * its frame's top-left corner at its own size, so if the two sizes differ the
 * switch can't be centred from the layout. A screenshot with the outline shows
 * both sizes. Off in release builds; remove once the switch is fixed.
 */
const SHOW_FRAME = __DEV__;

type ToggleSwitchProps = Omit<
  SwitchProps,
  'trackColor' | 'thumbColor' | 'ios_backgroundColor'
>;

/**
 * The app's one switch: ink when on (the brand has no hue, D33), a 3:1 grey
 * track when off so "off" still reads as a control (DESIGN_SYSTEM §2.2
 * controlBorder), and a white thumb in both appearances, as iOS draws its own
 * (D7). Every switch goes through here, so a fix for how the phone draws it
 * lands everywhere at once.
 */
export function ToggleSwitch(props: ToggleSwitchProps) {
  return (
    <View style={styles.frame}>
      <Switch
        {...props}
        trackColor={{ true: colors.action, false: colors.controlBorder }}
        thumbColor={colors.onAction}
        ios_backgroundColor={colors.controlBorder}
        // react-native-web's name for the thumb when on.
        {...{ activeThumbColor: colors.onAction }}
      />
      {SHOW_FRAME && <View pointerEvents="none" style={styles.outline} />}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignSelf: 'center' },
  outline: {
    ...StyleSheet.absoluteFillObject,
    borderColor: colors.destructive,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
