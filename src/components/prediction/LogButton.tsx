import { Pressable, StyleSheet } from 'react-native';

import { haptics } from '@/components/ui/haptics';
import { Icon } from '@/components/ui/Icon';
import { colors, radius, space } from '@/constants/theme';

interface LogButtonProps {
  onPress: () => void;
}

/** The visible disc; the target around it is 44pt. */
const DISC = 32;

/**
 * The tinted "+" that opens Log (roadmap D3), in the trailing end of the
 * title bar on Today, Insights and History (D21, 2026-10-09). It used to float
 * above the tab bar, where it sat over "Resolve all", card text and the
 * chart's top-right corner, the overconfident end the chart exists to show.
 * In the header nothing is ever under it. With SDK 58's native tabs it can
 * move beside the tab bar, where Liquid Glass gives the add action its own
 * place. A word for VoiceOver, since "+" alone says nothing.
 */
export function LogButton({ onPress }: LogButtonProps) {
  return (
    <Pressable
      onPress={() => {
        haptics.commit();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="Log a prediction"
      hitSlop={(44 - DISC) / 2}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      testID="log-button"
    >
      <Icon sf="plus" fallback="add" size={20} color={colors.onBrand} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.brand600,
    borderRadius: radius.pill,
    height: DISC,
    justifyContent: 'center',
    marginRight: space.lg,
    width: DISC,
  },
  pressed: { backgroundColor: colors.brand700 },
});
