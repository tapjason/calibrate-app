import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '@/constants/theme';

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

/**
 * A thin bullet-graph in the hero (DESIGN_SYSTEM §7.1): where the score sits
 * on 0–100, read like an instrument's scale (roadmap D33). A hairline track,
 * an ink fill, the give-or-take as a soft band, and a needle at the score. No
 * colour for good or bad: everything is ink, and the needle is the number's
 * place.
 *
 * No 70 / 85 / 90 marks, on Today (step 173) or Insights (record audit
 * 2026-11-23): they are a category's badge bars, and under the overall
 * rating, which has no tiers, testers read unlabelled marks as tiers or a
 * pass mark (blind playtests 2026-11-09b, finding 9, and 2026-11-12f,
 * finding 1). The bars are in How scoring works, at Badges.
 */
export function ScoreBar({ score, range, testID }: ScoreBarProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const low = range ? Math.max(0, range.low) : 0;
  const high = range ? Math.min(100, range.high) : 0;
  const band = range && high > low ? { left: low, width: high - low } : null;
  // Decoration: the number beside it is what a screen reader hears, with the
  // give-or-take the band draws.
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
        <View style={[styles.needle, { left: `${clamped}%` }]} testID={testID ? `${testID}-needle` : undefined} />
      </View>
    </View>
  );
}

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
});
