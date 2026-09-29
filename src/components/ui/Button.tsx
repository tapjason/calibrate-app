import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { colors, radius, type } from '@/constants/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  testID?: string;
  /** Spoken instead of `label` — for labels like "+5" that mean nothing aloud. */
  accessibilityLabel?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// DESIGN_SYSTEM §6.1 `press`: scale 0.97 on a stiff spring, ~120 ms. Under
// Reduce Motion it becomes a plain opacity dip — feedback without movement.
const PRESS_SCALE = 0.97;
const SPRING = { damping: 20, stiffness: 320 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const pressStyle = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: 1 - pressed.value * 0.2 }
      : { transform: [{ scale: 1 - pressed.value * (1 - PRESS_SCALE) }] },
  );

  return (
    <AnimatedPressable
      testID={testID}
      onPress={onPress}
      onPressIn={() => {
        pressed.value = reduceMotion ? 1 : withSpring(1, SPRING);
      }}
      onPressOut={() => {
        pressed.value = reduceMotion ? 0 : withSpring(0, SPRING);
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.base, styles[variant], disabled && styles.disabled, pressStyle]}
    >
      <Text style={[styles.labelBase, styles[`label_${variant}`]]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    // 44pt: Apple's minimum comfortable tap target.
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 20,
    // Capsule (DESIGN_SYSTEM §4).
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // One tinted primary per screen: brand600 fill, white label 6.29:1.
  primary: { backgroundColor: colors.brand600 },
  // Neutral: surface fill with a 3:1 outline so it reads as a control on
  // white as well as on the canvas. Resolve's Yes and No both use this.
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.controlBorder,
    borderWidth: 1,
  },
  // Destructive actions only (sign-out, delete) — never an outcome.
  danger: { backgroundColor: colors.destructive },
  disabled: { opacity: 0.4 },
  labelBase: type.headline,
  label_primary: { color: colors.onBrand },
  label_secondary: { color: colors.textPrimary },
  label_danger: { color: colors.onBrand },
});
