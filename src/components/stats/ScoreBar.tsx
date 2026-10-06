import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '@/constants/theme';

interface ScoreBarProps {
  /** The unlocked calibration rating, 0–100. */
  score: number;
  testID?: string;
}

// The thresholds the badges use (CLAUDE.md badge table), so the bar and the
// badge ladder speak the same numbers. Oura uses the same 70/85 cut points.
//
// 85 and 90 sit 5% apart, which on a 320pt-wide screen (an iPhone mini in
// Display Zoom) is narrower than two labels: centred, they ran together as
// "8590". So those two hug their ticks from the outside, 85 on the left and
// 90 on the right, and only 70 is centred (roadmap step 52).
const TICKS = [
  { at: 70, align: 'center' },
  { at: 85, align: 'before' },
  { at: 90, align: 'after' },
] as const;

/**
 * A thin bullet-graph under the hero rating (DESIGN_SYSTEM §7.1): where the
 * score sits on 0–100, with ticks at 70 / 85 / 90. No gauge, no colour for
 * good or bad — the fill is ink and the marker is the number's position.
 */
export function ScoreBar({ score, testID }: ScoreBarProps) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <View
      style={styles.wrap}
      testID={testID}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${clamped}%` }]} />
        {TICKS.map((t) => (
          <View key={t.at} style={[styles.tick, { left: `${t.at}%` }]} />
        ))}
      </View>
      <View style={styles.labels}>
        {TICKS.map((t) => (
          <Text
            key={t.at}
            testID={`score-bar-label-${t.at}`}
            style={[styles.label, styles[t.align], { left: `${t.at}%` }]}
          >
            {t.at}
          </Text>
        ))}
      </View>
    </View>
  );
}

// Wide enough for "100" at caption size; the gap clears the 2pt tick.
const LABEL_WIDTH = 24;
const LABEL_GAP = 3;

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: space.md },
  track: {
    backgroundColor: colors.hairline,
    borderRadius: radius.pill,
    height: 8,
    overflow: 'visible',
  },
  fill: { backgroundColor: colors.textPrimary, borderRadius: radius.pill, height: 8 },
  tick: {
    backgroundColor: colors.surface,
    height: 12,
    marginLeft: -1,
    position: 'absolute',
    top: -2,
    width: 2,
  },
  labels: { height: 18, marginTop: 4 },
  label: {
    ...type.caption,
    color: colors.textSecondary,
    position: 'absolute',
    width: LABEL_WIDTH,
  },
  center: { marginLeft: -LABEL_WIDTH / 2, textAlign: 'center' },
  // Ends just left of its tick.
  before: { marginLeft: -LABEL_WIDTH - LABEL_GAP, textAlign: 'right' },
  // Starts just right of its tick.
  after: { marginLeft: LABEL_GAP, textAlign: 'left' },
});
