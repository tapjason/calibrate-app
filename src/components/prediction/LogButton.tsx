import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/components/ui/haptics';
import { Icon } from '@/components/ui/Icon';
import { colors, elevation, radius } from '@/constants/theme';

interface LogButtonProps {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Its side, so a screen can keep its last row clear of it. */
export const LOG_BUTTON_SIZE = 56;

/**
 * The tinted "+" that opens Log (roadmap D3). Logging is an action, and HIG
 * says a tab bar navigates rather than acts, so it floats beside the tabs
 * instead of being one, as Oura's and Structured's do. The one filled brand
 * control on the tab screens; a word for VoiceOver, since "+" alone says
 * nothing.
 */
export function LogButton({ onPress, style }: LogButtonProps) {
  return (
    <Pressable
      onPress={() => {
        haptics.commit();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="Log a prediction"
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
      testID="log-button"
    >
      <Icon sf="plus" fallback="add" size={28} color={colors.onBrand} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    ...elevation.e2,
    alignItems: 'center',
    backgroundColor: colors.brand600,
    borderRadius: radius.pill,
    height: LOG_BUTTON_SIZE,
    justifyContent: 'center',
    width: LOG_BUTTON_SIZE,
  },
  pressed: { backgroundColor: colors.brand700 },
});
