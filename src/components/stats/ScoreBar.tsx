import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BADGE_META } from '@/constants/badges';
import { colors, radius, space, type } from '@/constants/theme';

interface ScoreBarProps {
  /** The unlocked calibration rating, 0–100. */
  score: number;
  /**
   * How far the score could move with different luck (roadmap D4), drawn as a
   * soft band across the end of the fill. The engine computes it.
   */
  range?: { low: number; high: number } | null;
  /** Say what the marks are beneath the bar: on Insights, not Today's hero (D54). */
  caption?: boolean;
  testID?: string;
}

// The thresholds the badges use (CLAUDE.md badge table), so the bar and the
// badge ladder speak the same numbers. Oura uses the same 70/85 cut points.
//
// 85 and 90 sit 5% apart, which on a 320pt-wide screen (an iPhone mini in
// Display Zoom) is narrower than two labels: centred, they ran together as
// "8590". So those two hug their ticks from the outside, 85 on the left and
// 90 on the right (roadmap step 52). 70 hugs from the left too: centred, it
// ran into 85 at large text, "7085" (playtest 2026-11-08b, finding 16).
const TICKS = [
  { at: 70, align: 'before', badge: 'forecaster' },
  { at: 85, align: 'before', badge: 'sharp' },
  { at: 90, align: 'after', badge: 'oracle' },
] as const;

/**
 * A thin bullet-graph in the hero (DESIGN_SYSTEM §7.1): where the score sits
 * on 0–100, read like an instrument's scale (roadmap D33). A hairline track,
 * an ink fill notched at 70 / 85 / 90, and a needle at the score. No colour
 * for good or bad: everything is ink, and the needle is the number's place.
 */
/**
 * "The marks are a category's badge bars: Forecaster above 70, Sharp above 85,
 * Oracle above 90." Unlabelled, three rounds of testers read them as a rising
 * trend or a goal for the overall rating (blind playtest 2026-11-09b, finding
 * 9; roadmap D54), and a screen reader heard nothing of them.
 */
export const SCORE_MARKS_CAPTION = `The marks are a category's badge bars: ${TICKS.map(
  (t) => `${BADGE_META[t.badge].label} above ${t.at}`,
).join(', ')}, at its score's low end.`;

export function ScoreBar({ score, range, caption = false, testID }: ScoreBarProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const low = range ? Math.max(0, range.low) : 0;
  const high = range ? Math.min(100, range.high) : 0;
  const band = range && high > low ? { left: low, width: high - low } : null;
  // The labels grow with the text up to half again, like the chart's own
  // fixed-size ticks beside them; their boxes grow with them.
  const { fontScale } = useWindowDimensions();
  const scale = Math.min(Math.max(fontScale, 1), LABEL_MAX_SCALE);
  const labelWidth = Math.ceil(LABEL_WIDTH * scale);
  return (
    <View style={styles.wrap}>
    <View
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
      <View style={[styles.labels, { height: Math.ceil(LABELS_HEIGHT * scale) }]}>
        {TICKS.map((t) => (
          <Text
            key={t.at}
            testID={`score-bar-label-${t.at}`}
            maxFontSizeMultiplier={LABEL_MAX_SCALE}
            numberOfLines={1}
            style={[
              styles.label,
              { left: `${t.at}%`, width: labelWidth },
              t.align === 'before'
                ? { marginLeft: -labelWidth - LABEL_GAP, textAlign: 'right' }
                : { marginLeft: LABEL_GAP, textAlign: 'left' },
            ]}
          >
            {t.at}
          </Text>
        ))}
      </View>
    </View>
      {/* What the marks are, on screen and to a screen reader (roadmap D54). */}
      {caption && (
        <Text style={styles.caption} testID={testID ? `${testID}-caption` : undefined}>
          {SCORE_MARKS_CAPTION}
        </Text>
      )}
    </View>
  );
}

// Wide enough for "100" at caption size; the gap clears the 2pt tick.
const LABEL_WIDTH = 24;
const LABEL_GAP = 3;
const LABELS_HEIGHT = 18;
const LABEL_MAX_SCALE = 1.5;

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
  labels: { marginTop: 10 },
  caption: { ...type.footnote, color: colors.textSecondary, marginTop: space.xs },
  // Each label ends just left of its tick, or (90) starts just right of it.
  label: {
    ...type.caption,
    color: colors.textSecondary,
    position: 'absolute',
  },
});
