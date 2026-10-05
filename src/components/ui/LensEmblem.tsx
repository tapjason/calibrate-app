import { View } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '@/constants/theme';
import type { BadgeLevel } from '@/types';

interface LensEmblemProps {
  tier: BadgeLevel;
  /** Rendered edge length in points. 28 in lists, 64 as a header, 120 for a tier-up. */
  size?: number;
  /**
   * Not yet earned: draw the tier as a blueprint — outline only, faint — with
   * a solid stroke tracing the outline as far as the user has come (0–1).
   * `null` draws the blueprint with no progress stroke (a score gate, where
   * there is no distance to cover).
   */
  progress?: number | null;
  /**
   * Blueprint ink on a dark share card. Defaults suit the app canvas; cards
   * pass their own theme colours so the emblem reads on any background.
   */
  inkColor?: string;
  progressColor?: string;
  testID?: string;
}

interface TierLook {
  fill: string | 'gradient' | null;
  outline: string;
  diagonal: string;
  rings: number;
  bezel: boolean;
  dashed: boolean;
}

// DESIGN_SYSTEM §7.4. Tier is carried by fill + ring count + the written
// label beside the emblem — never by colour alone. Indigo ramp + gold, so no
// tier collides with the over/under/calibrated hues.
const LOOKS: Record<BadgeLevel, TierLook> = {
  guesser: {
    fill: null,
    outline: colors.controlBorder,
    diagonal: colors.controlBorder,
    rings: 0,
    bezel: false,
    dashed: true,
  },
  tracker: {
    fill: colors.surfaceSunken,
    outline: colors.textSecondary,
    diagonal: colors.textSecondary,
    rings: 1,
    bezel: false,
    dashed: false,
  },
  forecaster: {
    fill: colors.brand600,
    outline: colors.brand600,
    diagonal: colors.onBrand,
    rings: 2,
    bezel: false,
    dashed: false,
  },
  sharp: {
    fill: colors.brand900,
    outline: colors.brand900,
    diagonal: colors.onBrand,
    rings: 3,
    bezel: true,
    dashed: false,
  },
  oracle: {
    fill: 'gradient',
    outline: colors.oracleGold,
    diagonal: colors.onBrand,
    rings: 4,
    bezel: true,
    dashed: false,
  },
};

/**
 * The "Lens" badge emblem: a continuous-corner square (radius 28% of size)
 * holding the calibration diagonal — the app's own motif, not a trophy.
 *
 * Pure SVG, so react-native-view-shot rasterises it inside share cards.
 * Decorative: the badge name is always written beside it, so the emblem is
 * hidden from screen readers (the props sit on a View because
 * react-native-svg forwards unknown props to the DOM on web).
 */
export function LensEmblem({
  tier,
  size = 28,
  progress,
  inkColor,
  progressColor,
  testID = `lens-${tier}`,
}: LensEmblemProps) {
  const look = LOOKS[tier];
  const blueprint = progress !== undefined;
  // Scales with size but stays a hairline-to-medium line even at 120 pt.
  const stroke = Math.min(3, Math.max(1.5, size / 20));
  const side = size - stroke;
  const r = side * 0.28;
  const o = stroke / 2;
  const inset = size * 0.28;
  const perimeter = 4 * (side - 2 * r) + 2 * Math.PI * r;
  const done =
    progress === null || progress === undefined ? 0 : Math.max(0, Math.min(1, progress));

  const ink = inkColor ?? look.outline;
  const gradientId = `lens-gradient-${size}`;

  // Concentric rings inside the face: 1 for Tracker up to 4 for Oracle.
  const rings = Array.from({ length: blueprint ? 0 : look.rings }, (_, i) => {
    const gap = size * 0.07 * (i + 1);
    return { x: o + gap, s: side - 2 * gap, rr: Math.max(0, r - gap) };
  });

  // Bezel: short ticks centred on each edge (Sharp, Oracle).
  const tick = size * 0.1;
  const mid = size / 2;
  const bezel =
    !blueprint && look.bezel
      ? [
          [mid, 0, mid, tick],
          [mid, size, mid, size - tick],
          [0, mid, tick, mid],
          [size, mid, size - tick, mid],
        ]
      : [];

  const faceFill = blueprint
    ? 'none'
    : look.fill === 'gradient'
      ? `url(#${gradientId})`
      : (look.fill ?? 'none');

  return (
    <View
      testID={testID}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size}>
        {look.fill === 'gradient' && !blueprint && (
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.brand600} />
              <Stop offset="1" stopColor={colors.oracleViolet} />
            </LinearGradient>
          </Defs>
        )}
        <Rect
          x={o}
          y={o}
          width={side}
          height={side}
          rx={r}
          fill={faceFill}
          stroke={ink}
          strokeWidth={stroke}
          strokeDasharray={
            blueprint || look.dashed ? `${stroke * 2} ${stroke * 2}` : undefined
          }
          opacity={blueprint ? 0.6 : 1}
        />
        {rings.map((g, i) => (
          <Rect
            key={i}
            x={g.x}
            y={g.x}
            width={g.s}
            height={g.s}
            rx={g.rr}
            fill="none"
            stroke={look.diagonal}
            strokeWidth={Math.max(0.75, stroke / 2)}
            opacity={0.35}
          />
        ))}
        {bezel.map(([x1, y1, x2, y2], i) => (
          <Line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={tier === 'oracle' ? colors.oracleGold : colors.onBrand}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        ))}
        <G>
          <Line
            x1={inset}
            y1={size - inset}
            x2={size - inset}
            y2={inset}
            stroke={blueprint ? ink : look.diagonal}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={blueprint || look.dashed ? `0.1 ${stroke * 2.5}` : undefined}
          />
        </G>
        {blueprint && done > 0 && (
          <Rect
            testID={`${testID}-progress`}
            x={o}
            y={o}
            width={side}
            height={side}
            rx={r}
            fill="none"
            stroke={progressColor ?? colors.brand600}
            strokeWidth={stroke}
            strokeDasharray={`${done * perimeter} ${perimeter}`}
            strokeLinecap="round"
          />
        )}
      </Svg>
    </View>
  );
}
