import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { BadgeLevel } from '@/types';

import { LensEmblem } from './LensEmblem';

/** DESIGN_SYSTEM §6.1 `tierUp`: the emblem flips on Y over 600 ms. */
export const FLIP_MS = 600;

interface TierFlipProps {
  from: BadgeLevel;
  to: BadgeLevel;
  size: number;
}

/**
 * The tier-up emblem: the old tier turns away on Y and the new one turns in,
 * each for half the flip. Both faces are drawn and swapped by opacity at the
 * edge-on midpoint, so nothing re-renders mid-animation and the back of a face
 * is never shown. Reduce Motion skips straight to the new tier (§6.1
 * `reduced`: no flips).
 *
 * Decorative, like LensEmblem: the tier is always written beside it.
 */
export function TierFlip({ from, to, size }: TierFlipProps) {
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    turn.value = withTiming(1, { duration: FLIP_MS, easing: Easing.inOut(Easing.cubic) });
  }, [reduceMotion, turn]);

  const outgoing = useAnimatedStyle(() => ({
    opacity: turn.value < 0.5 ? 1 : 0,
    transform: [{ perspective: size * 6 }, { rotateY: `${turn.value * 180}deg` }],
  }));
  const incoming = useAnimatedStyle(() => ({
    opacity: turn.value < 0.5 ? 0 : 1,
    transform: [{ perspective: size * 6 }, { rotateY: `${(turn.value - 1) * 180}deg` }],
  }));

  return (
    <View style={{ width: size, height: size }} testID="tier-flip">
      <Animated.View style={[StyleSheet.absoluteFill, outgoing]}>
        <LensEmblem tier={from} size={size} testID={`tier-flip-from-${from}`} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, incoming]}>
        <LensEmblem tier={to} size={size} testID={`tier-flip-to-${to}`} />
      </Animated.View>
    </View>
  );
}
