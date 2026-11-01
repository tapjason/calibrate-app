import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '@/constants/theme';

interface ScoreBarProps {
  /** The unlocked calibration rating, 0–100. */
  score: number;
  /**
   * How far the score could move with different luck (roadmap D4), drawn as a
   * soft band across the end of the fill. The engine computes it.
   */
  range?: { low: number; high: number } | null;
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
 * A thin bullet-graph in the hero (DESIGN_SYSTEM §7.1): where the score sits
 * on 0–100, read like an instrument's scale (roadmap D33). A hairline track,
 * an ink fill notched at 70 / 85 / 90, and a needle at the score. No colour
 * for good or bad: everything is ink, and the needle is the number's place.
 */
export function ScoreBar({ score, range, testID }: ScoreBarProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const low = range ? Math.max(0, range.low) : 0;
  const high = range ? Math.min(100, range.high) : 0;
  const band = range && high > low ? { left: low, width: high - low } : null;
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
        {band && (
          <View
            testID={testID ? `${testID}-range` : undefined}
            style={[styles.range, { left: `${band.left}%`, width: `${band.width}%` }]}
          />
        )}
        {TICKS.map((t) => (
          <View key={t.at} style={[styles.tick, { left: `${t.at}%` }]} />
        ))}
        <View style={[styles.needle, { left: `${clamped}%` }]} testID={testID ? `${testID}-needle` : undefined} />
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
  wrap: { alignSelf: 'stretch', marginTop: space.lg, paddingTop: 8 },
  track: {
    backgroundColor: colors.emphasis,
    borderRadius: radius.pill,
    height: 4,
    overflow: 'visible',
  },
  fill: { backgroundColor: colors.textPrimary, borderRadius: radius.pill, height: 4 },
  // The give-or-take: a taller, see-through capsule over the end of the fill,
  // so where the score could be reads as a zone, not a point.
  range: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 12,
    opacity: 0.16,
    position: 'absolute',
    top: -4,
  },
  // A notch cut through the track in the canvas colour, where a tier begins.
  tick: {
    backgroundColor: colors.canvas,
    height: 4,
    marginLeft: -1,
    position: 'absolute',
    top: 0,
    width: 2,
  },
  // The needle stands above and below the track, so the score reads as a
  // reading on the scale, not just the end of a bar.
  needle: {
    backgroundColor: colors.textPrimary,
    borderRadius: 2,
    height: 20,
    marginLeft: -1.5,
    position: 'absolute',
    top: -8,
    width: 3,
  },
  labels: { height: 18, marginTop: 10 },
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
