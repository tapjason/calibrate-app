import { StyleSheet, Text, View } from 'react-native';

import { colors, space, tabularNums, type } from '@/constants/theme';

interface SectionHeaderProps {
  title: string;
  /** How many the section holds, set apart on the right rather than joined with a dot. */
  count?: number;
  testID?: string;
}

/**
 * A list section's heading (roadmap D33): the title in the face's own
 * weight, the count in its own column at the right edge, where a column of
 * numbers belongs. It replaced "Ready to resolve · 10", the small grey label
 * with a middle dot that sat above most lists.
 */
export function SectionHeader({ title, count, testID }: SectionHeaderProps) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="header"
      accessibilityLabel={count === undefined ? title : `${title}, ${count}`}
      testID={testID}
    >
      <Text style={styles.title}>{title}</Text>
      {count !== undefined && <Text style={styles.count}>{count}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space.sm,
    marginTop: space.lg,
  },
  title: { ...type.headline, color: colors.textPrimary, flexShrink: 1 },
  count: { ...type.subhead, ...tabularNums, color: colors.textSecondary },
});
