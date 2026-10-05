import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '@/constants/theme';

interface ScoreBarProps {
  /** The unlocked calibration rating, 0–100. */
  score: number;
  testID?: string;
}

// The thresholds the badges use (CLAUDE.md badge table), so the bar and the
// badge ladder speak the same numbers. Oura uses the same 70/85 cut points.
const TICKS = [70, 85, 90] as const;

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
          <View key={t} style={[styles.tick, { left: `${t}%` }]} />
        ))}
      </View>
      <View style={styles.labels}>
        {TICKS.map((t) => (
          <Text key={t} style={[styles.label, { left: `${t}%` }]}>
            {t}
          </Text>
        ))}
      </View>
    </View>
  );
}

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
    marginLeft: -8,
    position: 'absolute',
    textAlign: 'center',
    width: 16,
  },
});
