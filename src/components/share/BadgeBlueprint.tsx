import { View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

interface BadgeBlueprintProps {
  /** Share of the requirement met, 0–1; null draws the outline only. */
  progress: number | null;
  /** The outline and diagonal — the "not yet earned" ink. */
  trackColor: string;
  /** The progress stroke. */
  progressColor: string;
  size?: number;
}

const STROKE = 2;

/**
 * The not-yet-earned badge, drawn as a blueprint: a dashed continuous-corner
 * square with a dotted calibration diagonal, and a solid stroke tracing the
 * outline as far as the user has come (DESIGN_SYSTEM §7.4).
 *
 * A stand-in for `LensEmblem` (UI_ROADMAP step 8), built to the same geometry
 * — radius 28% of size, the diagonal as the motif — so swapping it out later
 * changes the fill and ring details, not the layout.
 *
 * Pure SVG, so react-native-view-shot rasterises it inside a share card. It is
 * decorative: the text beside it carries the meaning, so it is hidden from
 * screen readers.
 */
export function BadgeBlueprint({
  progress,
  trackColor,
  progressColor,
  size = 44,
}: BadgeBlueprintProps) {
  const side = size - STROKE;
  const r = side * 0.28;
  // Perimeter of a rounded square: four straight runs plus one full circle.
  const perimeter = 4 * (side - 2 * r) + 2 * Math.PI * r;
  const clamped = progress === null ? 0 : Math.max(0, Math.min(1, progress));
  const inset = size * 0.3;

  return (
    // The accessibility props live on a View: react-native-svg forwards
    // unknown props to the DOM on web, where React rejects them.
    <View
      testID="badge-blueprint"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size}>
        <Rect
          x={STROKE / 2}
          y={STROKE / 2}
          width={side}
          height={side}
          rx={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={STROKE}
          strokeDasharray="4 4"
          opacity={0.6}
        />
        <Line
          x1={inset}
          y1={size - inset}
          x2={size - inset}
          y2={inset}
          stroke={trackColor}
          strokeWidth={STROKE}
          strokeDasharray="1 4"
          strokeLinecap="round"
        />
        {clamped > 0 && (
          <Rect
            testID="badge-blueprint-progress"
            x={STROKE / 2}
            y={STROKE / 2}
            width={side}
            height={side}
            rx={r}
            fill="none"
            stroke={progressColor}
            strokeWidth={STROKE}
            strokeDasharray={`${clamped * perimeter} ${perimeter}`}
            strokeLinecap="round"
          />
        )}
      </Svg>
    </View>
  );
}
