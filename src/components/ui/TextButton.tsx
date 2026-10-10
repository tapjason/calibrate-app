import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, type } from '@/constants/theme';

interface TextButtonProps {
  label: string;
  onPress: () => void;
  /** Red label for an irreversible step (Delete); never for an outcome. */
  destructive?: boolean;
  testID?: string;
}

/**
 * A minor action as a text button (DESIGN_SYSTEM §7.20): brand subhead, a
 * 44pt target, never a capsule competing with the screen's one primary.
 */
export function TextButton({ label, onPress, destructive = false, testID }: TextButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={8}
      style={styles.button}
      testID={testID}
    >
      <Text style={[styles.label, destructive && styles.destructive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  label: { ...type.subhead, color: colors.brandText, fontWeight: '600' },
  destructive: { color: colors.destructive },
});
