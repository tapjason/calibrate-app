import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  G,
  Line,
  Polygon,
  Polyline,
  Text as SvgText,
} from 'react-native-svg';

import { haptics } from '@/components/ui/haptics';
import { colors, svgFontFamily, type } from '@/constants/theme';
import type { BucketStat, Direction } from '@/types';

import { describeCalibrationCurve } from './chartDescription';

interface CalibrationChartProps {
  /** Non-empty buckets. Empty renders the ghost chart: frame, regions, diagonal. */
  buckets: BucketStat[];
  /**
   * Play the `reveal` motion (DESIGN_SYSTEM §6.1): the line draws in over
   * 400 ms, then the dots land 60 ms apart. Only for reveal moments — the
   * Warmup verdict — never on an ordinary visit to Stats.
   */
  animateIn?: boolean;
}

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);
const AnimatedG = Animated.createAnimatedComponent(G);

const DRAW_MS = 400;
const DOT_STAGGER_MS = 60;
const DOT_FADE_MS = 200;

// Plot geometry. The drawing area is a square (stated 0–100% on x, actual
// 0–100% on y); padding leaves room for the axis ticks and labels.
const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 28;
// Ticks at the bucket edges, so each dot sits between two gridlines.
const TICKS = [0, 20, 40, 60, 80, 100];
const TICK_FONT = type.caption.fontSize; // DESIGN_SYSTEM §3: 12pt is the chart minimum.

/** Dot fill per side of the diagonal (DESIGN_SYSTEM §2.3). */
const MARK: Record<Direction, string> = {
  overconfident: colors.overMark,
  underconfident: colors.underMark,
  calibrated: colors.calibratedMark,
};

/**
 * The calibration curve: stated confidence (x) vs. actual hit rate (y).
 *
 * Three channels for every meaning, never colour alone (DESIGN_SYSTEM §7.2):
 * the region *below* the diagonal is tinted warm and labelled Overconfident,
 * the region above is tinted cool and labelled Underconfident, and each dot is
 * coloured by the side the engine says it's on (`BucketStat.direction`) —
 * position + tint + words. Every dot carries its n, so a lone 100% built on
 * two predictions reads as exactly that.
 *
 * With no buckets it still draws the frame, the regions and the diagonal: a
 * ghost chart that shows what's coming instead of an italic placeholder.
 *
 * react-native-svg, so it draws identically on web and native.
 */
export function CalibrationChart({ buckets, animateIn = false }: CalibrationChartProps) {
  const reduceMotion = useReducedMotion();
  const animate = animateIn && !reduceMotion;
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const height = width;
  const innerW = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const innerH = Math.max(0, height - PAD_TOP - PAD_BOTTOM);

  const xOf = (conf: number) => PAD_LEFT + (conf / 100) * innerW;
  const yOf = (rate: number) => PAD_TOP + (1 - rate) * innerH;

  const points = [...buckets].sort(
    (a, b) => a.stated_confidence_mean - b.stated_confidence_mean,
  );
  // The reveal ends on a Rigid tap as the last dot lands (DESIGN_SYSTEM §6.1).
  // Reduce Motion drops the motion but keeps the haptic, so it fires at once.
  const dotCount = points.length;
  const drawn = width > 0;
  useEffect(() => {
    if (!animateIn || !drawn || dotCount === 0) return;
    const landed = reduceMotion ? 0 : DRAW_MS + (dotCount - 1) * DOT_STAGGER_MS + DOT_FADE_MS;
    const timer = setTimeout(haptics.reveal, landed);
    return () => clearTimeout(timer);
  }, [animateIn, drawn, dotCount, reduceMotion]);

  const maxN = points.reduce((m, b) => Math.max(m, b.total_resolved), 1);
  const radiusOf = (n: number) => 4 + (n / maxN) * 6; // 4–10 px

  const coords = points.map((b) => [xOf(b.stated_confidence_mean), yOf(b.actual_rate)]);
  const polyline = coords.map(([x, y]) => `${x},${y}`).join(' ');
  const lineLength = coords.reduce(
    (sum, [x, y], i) =>
      i === 0 ? 0 : sum + Math.hypot(x - coords[i - 1][0], y - coords[i - 1][1]),
    0,
  );

  const left = xOf(0);
  const right = xOf(100);
  const top = yOf(1);
  const bottom = yOf(0);
  const labelYs = placeDotLabels(
    points.map((p) => ({
      cx: xOf(p.stated_confidence_mean),
      cy: yOf(p.actual_rate),
      r: radiusOf(p.total_resolved),
      text: `n=${p.total_resolved}`,
    })),
    top,
    bottom,
  );

  return (
    <View
      style={styles.wrap}
      onLayout={onLayout}
      testID="calibration-chart"
      accessible
      accessibilityRole="image"
      accessibilityLabel={describeCalibrationCurve(buckets)}
    >
      {width > 0 ? (
        // The wrapper's label describes the whole curve. iOS already treats
        // an accessible View's children as one element; web doesn't, and read
        // every tick and (with the halo) every "n=" twice (roadmap step 42).
        <View aria-hidden={Platform.OS === 'web'}>
          <Svg width={width} height={height}>
            {/* Regions: below the diagonal = overconfident (warm), above =
                underconfident (cool). Faint — they're context, not data. */}
            <Polygon
              testID="region-over"
              points={`${left},${bottom} ${right},${bottom} ${right},${top}`}
              fill={colors.overMark}
              fillOpacity={0.07}
            />
            <Polygon
              testID="region-under"
              points={`${left},${bottom} ${left},${top} ${right},${top}`}
              fill={colors.underMark}
              fillOpacity={0.07}
            />

            {TICKS.map((t) => (
              <G key={t}>
                <Line
                  x1={xOf(t)}
                  y1={top}
                  x2={xOf(t)}
                  y2={bottom}
                  stroke={colors.hairline}
                  strokeWidth={1}
                />
                <Line
                  x1={left}
                  y1={yOf(t / 100)}
                  x2={right}
                  y2={yOf(t / 100)}
                  stroke={colors.hairline}
                  strokeWidth={1}
                />
                <SvgText
                  x={left - 5}
                  y={yOf(t / 100) + 4}
                  fontSize={TICK_FONT}
                  fontFamily={svgFontFamily}
                  fill={colors.textTertiary}
                  textAnchor="end"
                >
                  {t}
                </SvgText>
                <SvgText
                  x={xOf(t)}
                  y={bottom + 17}
                  fontSize={TICK_FONT}
                  fontFamily={svgFontFamily}
                  fill={colors.textTertiary}
                  // The last label hangs left of its tick so "100%" isn't
                  // clipped by the right edge.
                  textAnchor={t === 100 ? 'end' : 'middle'}
                >
                  {`${t}%`}
                </SvgText>
              </G>
            ))}

            <SvgText
              x={right - 8}
              y={bottom - 10}
              fontSize={TICK_FONT}
              fontFamily={svgFontFamily}
              fontWeight="600"
              fill={colors.overText}
              textAnchor="end"
            >
              Overconfident
            </SvgText>
            <SvgText
              x={left + 8}
              y={top + 18}
              fontSize={TICK_FONT}
              fontFamily={svgFontFamily}
              fontWeight="600"
              fill={colors.underText}
              textAnchor="start"
            >
              Underconfident
            </SvgText>

            {/* Perfect calibration. */}
            <Line
              x1={left}
              y1={bottom}
              x2={right}
              y2={top}
              stroke={colors.textSecondary}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />

            {/* Connecting line: neutral and thin — five buckets are not a
                function, the dots are the data. */}
            {points.length > 1 ? (
              animate ? (
                <DrawnLine points={polyline} length={lineLength} />
              ) : (
                <Polyline
                  testID="calibration-curve-line"
                  points={polyline}
                  fill="none"
                  stroke={colors.textTertiary}
                  strokeWidth={1.5}
                />
              )
            ) : null}

            {points.map((b, i) => {
              const cx = xOf(b.stated_confidence_mean);
              const cy = yOf(b.actual_rate);
              const r = radiusOf(b.total_resolved);
              const labelY = labelYs[i];
              return (
                <DotGroup key={b.low} animate={animate} delay={DRAW_MS + i * DOT_STAGGER_MS}>
                  <Circle
                    testID={`point-${b.low}`}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={MARK[b.direction]}
                    stroke={colors.surface}
                    strokeWidth={1.5}
                  />
                  {/* A canvas-coloured halo under the label, so the
                      connecting line or the diagonal never runs through the
                      text. Two layered texts rather than `paintOrder`, which
                      react-native-svg doesn't reliably honour. */}
                  <SvgText
                    testID={`point-${b.low}-n-halo`}
                    x={cx}
                    y={labelY}
                    fontSize={TICK_FONT}
                    fontFamily={svgFontFamily}
                    fill={colors.canvas}
                    stroke={colors.canvas}
                    strokeWidth={3}
                    strokeLinejoin="round"
                    textAnchor="middle"
                  >
                    {`n=${b.total_resolved}`}
                  </SvgText>
                  <SvgText
                    testID={`point-${b.low}-n`}
                    x={cx}
                    y={labelY}
                    fontSize={TICK_FONT}
                    fontFamily={svgFontFamily}
                    fill={colors.textSecondary}
                    textAnchor="middle"
                  >
                    {`n=${b.total_resolved}`}
                  </SvgText>
                </DotGroup>
              );
            })}
          </Svg>
        </View>
      ) : null}

      <Text style={styles.caption}>
        Across: how sure you said you were. Up: how often it happened. Dashed line:
        perfectly calibrated.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Square, so cap it: on a tablet or wide web window a full-width chart
  // would push everything else below the fold.
  wrap: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  caption: { ...type.footnote, color: colors.textSecondary, marginTop: 4 },
});

/** The connecting line, drawn in by animating its dash offset. */
function DrawnLine({ points, length }: { points: string; length: number }) {
  const offset = useSharedValue(length);
  useEffect(() => {
    offset.value = withTiming(0, { duration: DRAW_MS });
  }, [offset]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));
  return (
    <AnimatedPolyline
      testID="calibration-curve-line"
      points={points}
      fill="none"
      stroke={colors.textTertiary}
      strokeWidth={1.5}
      strokeDasharray={`${length} ${length}`}
      animatedProps={animatedProps}
    />
  );
}

interface DotLabelInput {
  cx: number;
  cy: number;
  r: number;
  text: string;
}

/**
 * Baseline y for each dot's "n=…" label. Above the dot by default; below it
 * when above would leave the plot or would overprint a label already placed
 * (two buckets either side of 80% can sit a few pixels apart, and "n=5n=5"
 * reads as nothing). Widths are estimated, which is enough to keep apart
 * labels this short. Exported for tests.
 */
export function placeDotLabels(dots: DotLabelInput[], top: number, bottom: number): number[] {
  const charW = TICK_FONT * 0.6;
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const boxAt = (d: DotLabelInput, y: number) => {
    const half = (d.text.length * charW) / 2;
    return { x0: d.cx - half, x1: d.cx + half, y0: y - TICK_FONT, y1: y };
  };
  const clashes = (box: (typeof placed)[number]) =>
    placed.some((o) => box.x0 < o.x1 && o.x0 < box.x1 && box.y0 < o.y1 && o.y0 < box.y1);

  return dots.map((d) => {
    const above = d.cy - d.r - 4;
    const below = d.cy + d.r + TICK_FONT;
    const aboveFits = above - TICK_FONT >= top;
    const belowFits = below <= bottom;
    const options = aboveFits ? [above, below] : [below, above];
    const y =
      options.find((o) => (o === above ? aboveFits : belowFits) && !clashes(boxAt(d, o))) ??
      options[0];
    placed.push(boxAt(d, y));
    return y;
  });
}

/** A dot and its n label, fading in after the line when animating. */
function DotGroup({
  animate,
  delay,
  children,
}: {
  animate: boolean;
  delay: number;
  children: React.ReactNode;
}) {
  const opacity = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (animate) opacity.value = withDelay(delay, withTiming(1, { duration: DOT_FADE_MS }));
  }, [animate, delay, opacity]);
  const animatedProps = useAnimatedProps(() => ({ opacity: opacity.value }));
  return <AnimatedG animatedProps={animatedProps}>{children}</AnimatedG>;
}
