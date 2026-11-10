import { StyleSheet, Text, View } from 'react-native';

import { colors, space, tabularNums, type } from '@/constants/theme';

interface SectionHeaderProps {
  title: string;
  /** How many the section holds, set apart on the right rather than joined with a dot. */
  count?: number;
  /** What the count counts, spoken with it: "Next 7 days, 7 predictions". */
  unit?: { one: string; other: string };
  testID?: string;
}

/**
 * A list section's heading (roadmap D33): the title in the face's own
 * weight, the count in its own column at the right edge, where a column of
 * numbers belongs. It replaced "Ready to answer · 10", the small grey label
 * with a middle dot that sat above most lists.
 */
export function SectionHeader({ title, count, unit, testID }: SectionHeaderProps) {
  // A bare number after the title said nothing of what it counted (playtest
  // 2026-11-08b, finding 29).
  const counted =
    count === undefined ? '' : `, ${count}${unit ? ` ${count === 1 ? unit.one : unit.other}` : ''}`;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${title}${counted}`}
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
