import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/constants/theme';

import { Icon } from './Icon';

interface CloseButtonProps {
  onPress: () => void;
  testID?: string;
  /** Where it sits: the paywall floats it over its title; Account gives it a row. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The way out of a screen with no header (roadmap step 30): a 44pt sunken
 * circle with an ×, labelled "Close" for a screen reader. One look for every
 * such screen, so leaving never has to be found twice.
 */
export function CloseButton({ onPress, testID, style }: CloseButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={8}
      style={[styles.button, style]}
      testID={testID}
    >
      <Icon sf="xmark" fallback="close" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const SIZE = 44;

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    height: SIZE,
    justifyContent: 'center',
    width: SIZE,
  },
});
