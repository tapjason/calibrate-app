import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { colors, space, type } from '@/constants/theme';

interface EmptyStateProps {
  /** One sentence: what will be here, not an apology that it isn't. */
  message: string;
  /**
   * The symbol over the sentence (DESIGN_SYSTEM §7.8): an SF Symbol on iOS
   * and its Ionicon elsewhere. Decorative; the sentence carries the meaning.
   */
  symbol?: Pick<ComponentProps<typeof Icon>, 'sf' | 'fallback'>;
  /** The way forward. Every empty state has one (DESIGN_SYSTEM §7.8). */
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

/**
 * An empty section: a symbol, one plain sentence and a button. Replaces the
 * italic grey placeholder lines, which failed contrast and led nowhere.
 *
 * The button is the primary capsule: where an empty state shows, its way
 * forward is the only action on the screen, and an outlined button left an
 * empty Home with nothing tinted to tap (roadmap step 56).
 */
export function EmptyState({ message, symbol, actionLabel, onAction, testID }: EmptyStateProps) {
  return (
    <View style={styles.wrap} testID={testID}>
      {symbol && (
        <Icon
          sf={symbol.sf}
          fallback={symbol.fallback}
          size={36}
          color={colors.textSecondary}
          testID={testID ? `${testID}-symbol` : undefined}
        />
      )}
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction && <Button label={actionLabel} onPress={onAction} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.lg, paddingVertical: space.xxxl },
  message: { ...type.callout, color: colors.textSecondary, textAlign: 'center' },
});
