import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Polygon,
  Polyline,
  Text as SvgText,
} from 'react-native-svg';

import { colors, svgFontFamily, type } from '@/constants/theme';
import type { BucketStat, Direction } from '@/types';

import { describeCalibrationCurve } from './chartDescription';

interface CalibrationChartProps {
  /** Non-empty buckets. Empty renders the ghost chart: frame, regions, diagonal. */
  buckets: BucketStat[];
}

// Plot geometry. The drawing area is a square (stated 0–100% on x, actual
// 0–100% on y); padding leaves room for the axis ticks and labels.
const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 28;
// Ticks at the bucket edges, so each dot sits between two gridlines.
const TICKS = [0, 20, 40, 60, 80, 100];
const TICK_FONT = 12; // DESIGN_SYSTEM §3: 12pt is the chart minimum.

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
export function CalibrationChart({ buckets }: CalibrationChartProps) {
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
  const maxN = points.reduce((m, b) => Math.max(m, b.total_resolved), 1);
  const radiusOf = (n: number) => 4 + (n / maxN) * 6; // 4–10 px

  const polyline = points
    .map((b) => `${xOf(b.stated_confidence_mean)},${yOf(b.actual_rate)}`)
    .join(' ');

  const left = xOf(0);
  const right = xOf(100);
  const top = yOf(1);
  const bottom = yOf(0);

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
                textAnchor="middle"
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
            <Polyline
              testID="calibration-curve-line"
              points={polyline}
              fill="none"
              stroke={colors.textTertiary}
              strokeWidth={1.5}
            />
          ) : null}

          {points.map((b) => {
            const cx = xOf(b.stated_confidence_mean);
            const cy = yOf(b.actual_rate);
            const r = radiusOf(b.total_resolved);
            // Label above the dot unless that would leave the plot.
            const labelY = cy - r - 4 < top + TICK_FONT ? cy + r + TICK_FONT : cy - r - 4;
            return (
              <G key={b.low}>
                <Circle
                  testID={`point-${b.low}`}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={MARK[b.direction]}
                  stroke={colors.surface}
                  strokeWidth={1.5}
                />
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
              </G>
            );
          })}
        </Svg>
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
