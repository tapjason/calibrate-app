import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, space, type } from '@/constants/theme';

interface EmptyStateProps {
  /** One sentence: what will be here, not an apology that it isn't. */
  message: string;
  /** The way forward. Every empty state has one (DESIGN_SYSTEM §7.8). */
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

/**
 * An empty section: one plain sentence and a button. Replaces the italic grey
 * placeholder lines, which failed contrast and led nowhere. The SF Symbol the
 * design system calls for arrives with expo-symbols (UI_ROADMAP step 2).
 */
export function EmptyState({ message, actionLabel, onAction, testID }: EmptyStateProps) {
  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction && (
        <Button label={actionLabel} variant="secondary" onPress={onAction} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.lg, paddingVertical: space.xxxl },
  message: { ...type.callout, color: colors.textSecondary, textAlign: 'center' },
});
