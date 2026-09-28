import { Pressable, StyleSheet, Text } from 'react-native';

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

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.labelBase, styles[`label_${variant}`]]}>{label}</Text>
    </Pressable>
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
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  labelBase: type.headline,
  label_primary: { color: colors.onBrand },
  label_secondary: { color: colors.textPrimary },
  label_danger: { color: colors.onBrand },
});
