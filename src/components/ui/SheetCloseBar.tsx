import { StyleSheet, View } from 'react-native';

import { colors, space } from '@/constants/theme';

import { CloseButton } from './CloseButton';

interface SheetCloseBarProps {
  onPress: () => void;
  testID?: string;
  /** The content under it has scrolled: a hairline sets the bar off from it. */
  scrolled?: boolean;
}

/**
 * The round × at the top of a sheet, on a canvas strip drawn over the
 * content: scrolled text ran up to the × with nothing behind it (blind
 * playtest 2026-11-12, finding 21), and on iOS a formSheet can lay its scroll
 * view over a header beside it (docs/app-profile.md §18), where the strip,
 * drawn above, still hides it. A hairline under it once the content has
 * scrolled, as an iOS bar does at its scroll edge; the line is always there,
 * clear at rest, so nothing moves when it shows.
 */
export function SheetCloseBar({ onPress, testID, scrolled = false }: SheetCloseBarProps) {
  return (
    <View style={[styles.bar, scrolled && styles.scrolled]} testID={testID && `${testID}-bar`}>
      <CloseButton onPress={onPress} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'flex-end',
    backgroundColor: colors.canvas,
    borderBottomColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: space.xs,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    zIndex: 1,
  },
  scrolled: { borderBottomColor: colors.hairline },
});
