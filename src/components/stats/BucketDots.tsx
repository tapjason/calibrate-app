import { StyleSheet, Text, View } from 'react-native';

import { colors, space, type } from '@/constants/theme';

interface BucketDotsProps {
  /** Resolved in the range. */
  total: number;
  /** Of those, how many happened. */
  happened: number;
  /** How many the stated confidences expected (engine: BucketStat.expected_yes). */
  expected: number;
  testID?: string;
}

/** More than this and each dot stands for several predictions. */
const MAX_DOTS = 60;

/**
 * One range as an icon array (roadmap D4, DESIGN_SYSTEM §7.2 item 8): a dot per
 * prediction, filled when it happened, hollow when it didn't, and a short
 * upright bar where your own numbers said the filled ones should end. Counts
 * people can see at a glance, which is how most people read a frequency best.
 *
 * Decorative for a screen reader: the sentence beside it says the same.
 */
export function BucketDots({ total, happened, expected, testID }: BucketDotsProps) {
  const per = Math.max(1, Math.ceil(total / MAX_DOTS));
  const dots = Math.ceil(total / per);
  const filled = Math.round(happened / per);
  const marker = Math.min(dots, Math.max(0, Math.round(expected / per)));

  const items: React.ReactNode[] = [];
  for (let i = 0; i <= dots; i++) {
    if (i === marker) {
      items.push(<View key="marker" style={styles.marker} testID={testID && `${testID}-marker`} />);
    }
    if (i < dots) {
      items.push(
        <View
          key={i}
          style={[styles.dot, i < filled ? styles.on : styles.off]}
          testID={testID && `${testID}-dot-${i}`}
        />,
      );
    }
  }

  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.grid} testID={testID}>
        {items}
      </View>
      {per > 1 && <Text style={styles.scale}>Each dot is {per} predictions.</Text>}
    </View>
  );
}

const DOT = 8;

const styles = StyleSheet.create({
  grid: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  dot: { borderRadius: DOT / 2, height: DOT, width: DOT },
  // Ink, not a calibration hue: happened is a fact, not a verdict (rule 0.4).
  on: { backgroundColor: colors.textPrimary },
  off: { borderColor: colors.controlBorder, borderWidth: 1.5 },
  // Shape, not colour, sets it apart: an upright bar among round dots. Not
  // brand indigo, which marks actions and never data (rule 0.6).
  marker: { backgroundColor: colors.textSecondary, borderRadius: 1, height: 14, width: 2 },
  scale: { ...type.caption, color: colors.textTertiary, marginTop: space.xs },
});
