import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Polyline,
  Text as SvgText,
} from 'react-native-svg';

import type { BucketStat } from '@/types';

interface CalibrationChartProps {
  buckets: BucketStat[];
}

// Plot geometry. The drawing area is a square (stated 0–100% on x, actual
// 0–100% on y); padding leaves room for the axis ticks and labels.
const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 28;
const TICKS = [0, 25, 50, 75, 100];

const IDEAL = '#cbd5e1'; // dashed diagonal — perfect calibration
const CURVE = '#2563eb'; // the user's actual curve
const GRID = '#f1f5f9';
const AXIS_LABEL = '#9ca3af';

/**
 * The calibration curve: stated confidence (x) vs. actual hit rate (y), with
 * a dashed diagonal marking perfect calibration. Points on the diagonal are
 * perfectly calibrated; above it the user was underconfident, below it
 * overconfident. Marker radius scales with how many predictions landed in the
 * bucket, so well-populated buckets read as more trustworthy.
 *
 * Rendered with react-native-svg so it draws identically on web and native
 * without a Skia/dev-client dependency.
 */
export function CalibrationChart({ buckets }: CalibrationChartProps) {
  // Measure the container so the square plot fills the available width.
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // Square aspect: height tracks width once measured.
  const height = width;
  const innerW = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const innerH = Math.max(0, height - PAD_TOP - PAD_BOTTOM);

  // Scales: confidence 0–100 → px; rate 0–1 → px (y is flipped for SVG).
  const xOf = (conf: number) => PAD_LEFT + (conf / 100) * innerW;
  const yOf = (rate: number) => PAD_TOP + (1 - rate) * innerH;

  // Order points left-to-right so the connecting line never doubles back.
  const points = [...buckets].sort(
    (a, b) => a.stated_confidence_mean - b.stated_confidence_mean,
  );
  const maxN = points.reduce((m, b) => Math.max(m, b.total_resolved), 1);
  const radiusOf = (n: number) => 4 + (n / maxN) * 6; // 4–10 px

  const polyline = points
    .map((b) => `${xOf(b.stated_confidence_mean)},${yOf(b.actual_rate)}`)
    .join(' ');

  return (
    <View style={styles.wrap} onLayout={onLayout} testID="calibration-chart">
      {width > 0 ? (
        <Svg width={width} height={height}>
          {/* gridlines + axis ticks */}
          {TICKS.map((t) => (
            <G key={t}>
              <Line
                x1={xOf(t)}
                y1={PAD_TOP}
                x2={xOf(t)}
                y2={PAD_TOP + innerH}
                stroke={GRID}
                strokeWidth={1}
              />
              <Line
                x1={PAD_LEFT}
                y1={yOf(t / 100)}
                x2={PAD_LEFT + innerW}
                y2={yOf(t / 100)}
                stroke={GRID}
                strokeWidth={1}
              />
              <SvgText
                x={PAD_LEFT - 6}
                y={yOf(t / 100) + 3}
                fontSize={9}
                fill={AXIS_LABEL}
                textAnchor="end"
              >
                {t}
              </SvgText>
              <SvgText
                x={xOf(t)}
                y={PAD_TOP + innerH + 14}
                fontSize={9}
                fill={AXIS_LABEL}
                textAnchor="middle"
              >
                {t}
              </SvgText>
            </G>
          ))}

          {/* perfect-calibration diagonal */}
          <Line
            x1={xOf(0)}
            y1={yOf(0)}
            x2={xOf(100)}
            y2={yOf(1)}
            stroke={IDEAL}
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />

          {/* the user's curve through the bucket points */}
          {points.length > 1 ? (
            <Polyline
              testID="calibration-curve-line"
              points={polyline}
              fill="none"
              stroke={CURVE}
              strokeWidth={2}
            />
          ) : null}

          {points.map((b) => (
            <Circle
              key={b.low}
              testID={`point-${b.low}`}
              cx={xOf(b.stated_confidence_mean)}
              cy={yOf(b.actual_rate)}
              r={radiusOf(b.total_resolved)}
              fill={CURVE}
              fillOpacity={0.85}
              stroke="#fff"
              strokeWidth={1.5}
            />
          ))}
        </Svg>
      ) : null}

      <View style={styles.axisCaption}>
        <Text style={styles.axisCaptionText}>
          stated confidence → · actual rate ↑ · dashed = perfect
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignSelf: 'stretch' },
  axisCaption: { alignItems: 'center', marginTop: 4 },
  axisCaptionText: { fontSize: 11, color: '#9ca3af' },
});
