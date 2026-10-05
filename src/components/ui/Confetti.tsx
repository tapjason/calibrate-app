import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { colors } from '@/constants/theme';

/** DESIGN_SYSTEM §6.1 `tierUp`: at most 40 pieces, gone within 1.2 s. */
export const CONFETTI_MAX_PIECES = 40;
export const CONFETTI_MS = 1200;

const GRAVITY = 900; // px/s², enough that every piece is falling by the end
const FADE_FROM = 0.7; // fraction of the run after which pieces fade out

export interface ConfettiPiece {
  /** Launch velocity, px/s; negative vy is upward. */
  vx: number;
  vy: number;
  /** Degrees per second. */
  spin: number;
  width: number;
  height: number;
  color: string;
}

/** Small deterministic PRNG (mulberry32), so a burst is the same every time. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The burst: an upward fan (20°–160° above the horizontal) at 180–420 px/s.
 * Pure and seeded, so tests can check the budget and a burst never depends on
 * Math.random. Exported for tests.
 */
export function confettiPieces(
  count: number,
  palette: readonly string[],
  seed = 7,
): ConfettiPiece[] {
  const next = random(seed);
  const n = Math.max(0, Math.min(CONFETTI_MAX_PIECES, Math.floor(count)));
  return Array.from({ length: n }, (_, i) => {
    const angle = ((20 + next() * 140) * Math.PI) / 180;
    const speed = 180 + next() * 240;
    return {
      vx: Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed,
      spin: (next() * 2 - 1) * 720,
      width: 6 + next() * 4,
      height: 3 + next() * 2,
      color: palette[i % palette.length] ?? colors.brand600,
    };
  });
}

/** The brand ramp: decoration is chrome, never a calibration hue (§2.4). */
export const BRAND_CONFETTI: readonly string[] = [
  colors.brand200,
  colors.brand400,
  colors.brand600,
  colors.brand800,
];

interface ConfettiProps {
  /** Burst origin inside the parent, in px. The parent must be positioned. */
  originX: number;
  originY: number;
  count?: number;
  palette?: readonly string[];
  testID?: string;
}

/**
 * A one-shot confetti burst for the badge tier-up (DESIGN_SYSTEM §6.1). Built
 * from Reanimated views, so it needs no Lottie file or particle library and
 * runs on web. One shared clock drives every piece.
 *
 * Decorative only: hidden from screen readers and from touches, and absent
 * entirely under Reduce Motion (the `reduced` variant has no confetti).
 */
export function Confetti({
  originX,
  originY,
  count = 36,
  palette = BRAND_CONFETTI,
  testID = 'confetti',
}: ConfettiProps) {
  const reduceMotion = useReducedMotion();
  const clock = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    clock.value = withTiming(1, { duration: CONFETTI_MS, easing: Easing.linear });
  }, [clock, reduceMotion]);

  if (reduceMotion) return null;

  const pieces = confettiPieces(count, palette);
  return (
    <View
      pointerEvents="none"
      style={[styles.origin, { left: originX, top: originY }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      {pieces.map((piece, i) => (
        <Piece key={i} piece={piece} clock={clock} />
      ))}
    </View>
  );
}

function Piece({ piece, clock }: { piece: ConfettiPiece; clock: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const s = (t * CONFETTI_MS) / 1000;
    return {
      opacity: t < FADE_FROM ? 1 : Math.max(0, 1 - (t - FADE_FROM) / (1 - FADE_FROM)),
      transform: [
        { translateX: piece.vx * s },
        { translateY: piece.vy * s + 0.5 * GRAVITY * s * s },
        { rotate: `${piece.spin * s}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        {
          width: piece.width,
          height: piece.height,
          marginLeft: -piece.width / 2,
          marginTop: -piece.height / 2,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  origin: { height: 0, position: 'absolute', width: 0, zIndex: 1 },
  piece: { borderRadius: 1, left: 0, position: 'absolute', top: 0 },
});
